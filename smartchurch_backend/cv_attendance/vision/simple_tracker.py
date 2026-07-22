# smartchurch_backend\cv_attendance\vision\simple_tracker.py
import time
import uuid

import numpy as np


STATUS_PRIORITY = {
    "TRACKING": 0,
    "AMBIGUOUS": 1,
    "UNKNOWN": 2,
    "KNOWN": 3,
}


def bbox_iou(box_a, box_b):
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(0, ax2 - ax1) * max(0, ay2 - ay1)
    area_b = max(0, bx2 - bx1) * max(0, by2 - by1)

    union = area_a + area_b - inter_area

    if union <= 0:
        return 0.0

    return inter_area / union


def bbox_center(box):
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def center_distance(box_a, box_b):
    ax, ay = bbox_center(box_a)
    bx, by = bbox_center(box_b)

    return float(np.sqrt((ax - bx) ** 2 + (ay - by) ** 2))


class SimpleFaceTracker:
    """
    Tracker sederhana berbasis IoU + jarak pusat.

    Perubahan penting:
    - UNKNOWN dan AMBIGUOUS tidak dianggap final selama track aktif.
    - KNOWN juga tetap boleh di-recognize ulang untuk mencari evidence terbaik.
    - Satu track menyimpan first_detected_at dan best_result.
    - Track yang expire dikembalikan ke caller agar dapat difinalisasi ke DB.
    """

    def __init__(
        self,
        iou_threshold=0.18,
        max_center_distance=80,
        max_lost_seconds=1.2,
        min_seen_count_for_recognition=1,
        ambiguous_retry_interval=0.20,
        unknown_retry_interval=0.35,
        known_retry_interval=0.35,
        force_size_growth_ratio=1.15,
        force_det_score_delta=0.05,
    ):
        self.iou_threshold = float(iou_threshold)
        self.max_center_distance = float(max_center_distance)
        self.max_lost_seconds = float(max_lost_seconds)

        self.min_seen_count_for_recognition = max(
            1,
            int(min_seen_count_for_recognition),
        )

        self.ambiguous_retry_interval = max(
            0.05,
            float(ambiguous_retry_interval),
        )
        self.unknown_retry_interval = max(
            0.05,
            float(unknown_retry_interval),
        )
        self.known_retry_interval = max(
            0.05,
            float(known_retry_interval),
        )

        self.force_size_growth_ratio = max(
            1.0,
            float(force_size_growth_ratio),
        )
        self.force_det_score_delta = max(
            0.0,
            float(force_det_score_delta),
        )

        self.tracks = {}

    @staticmethod
    def _copy_array(value):
        if value is None:
            return None

        try:
            return value.copy()
        except Exception:
            return value

    @staticmethod
    def _snapshot_score(snapshot):
        """
        Prioritas evidence:
            KNOWN > UNKNOWN > AMBIGUOUS > TRACKING

        Dalam status yang sama, similarity menjadi pembanding utama,
        kemudian detection score dan ukuran wajah.
        """
        status = str(snapshot.get("status") or "TRACKING").upper()

        return (
            STATUS_PRIORITY.get(status, 0),
            float(snapshot.get("similarity") or 0.0),
            float(snapshot.get("det_score") or 0.0),
            int(snapshot.get("face_size") or 0),
        )

    def collect_expired(self, now=None):
        """
        Menghapus dan mengembalikan track yang sudah tidak terlihat.
        Caller bertanggung jawab mem-finalisasi track tersebut ke database.
        """
        now = float(now if now is not None else time.time())

        expired_ids = [
            track_id
            for track_id, track in self.tracks.items()
            if now - float(track.get("last_seen") or now)
            > self.max_lost_seconds
        ]

        expired_tracks = []

        for track_id in expired_ids:
            track = self.tracks.pop(track_id, None)

            if track is not None:
                expired_tracks.append(track)

        return expired_tracks

    def update(self, detections, detected_at=None):
        """
        Return:
            tracked_faces, expired_tracks

        detected_at adalah datetime dari frame yang sedang diproses.
        Nilai ini disimpan sebagai first_detected_at ketika track dibuat.
        """
        now = time.time()
        expired_tracks = self.collect_expired(now=now)

        assigned_track_ids = set()
        output = []

        for detection in detections:
            bbox = detection["bbox"]

            best_track_id = None
            best_score = -1.0

            for track_id, track in self.tracks.items():
                if track_id in assigned_track_ids:
                    continue

                prev_bbox = track["bbox"]

                iou = bbox_iou(bbox, prev_bbox)
                dist = center_distance(bbox, prev_bbox)

                if (
                    iou >= self.iou_threshold
                    or dist <= self.max_center_distance
                ):
                    distance_score = max(
                        0.0,
                        1.0
                        - (
                            dist
                            / max(self.max_center_distance, 1.0)
                        ),
                    )

                    score = iou + (0.2 * distance_score)

                    if score > best_score:
                        best_score = score
                        best_track_id = track_id

            if best_track_id is None:
                track_id = f"trk_{uuid.uuid4().hex[:8]}"

                self.tracks[track_id] = {
                    "track_id": track_id,
                    "bbox": bbox,
                    "last_seen": now,
                    "created_at": now,
                    "first_detected_at": detected_at,
                    "seen_count": 1,

                    # Current recognition result.
                    "recognized": False,
                    "identity": "TRACKING",
                    "recognition_status": "TRACKING",
                    "recognition_similarity": 0.0,
                    "matched_member_id": None,
                    "candidate_member_id": None,
                    "matched_name": None,

                    # Retry metadata.
                    "recognition_attempts": 0,
                    "last_recognition_at": 0.0,
                    "last_recognition_face_size": 0,
                    "last_recognition_det_score": 0.0,

                    # Best evidence selama track masih aktif.
                    "best_result": None,

                    # Runtime control.
                    "finalized": False,
                    "db_pushed": False,
                    "last_log_at": 0.0,
                }

                is_new_track = True

            else:
                track_id = best_track_id
                track = self.tracks[track_id]

                track["bbox"] = bbox
                track["last_seen"] = now
                track["seen_count"] = (
                    int(track.get("seen_count") or 0) + 1
                )

                is_new_track = False

            assigned_track_ids.add(track_id)

            track = self.tracks[track_id]

            # Metadata observasi terakhir berguna untuk debugging.
            track["last_face_size"] = int(
                detection.get("face_size") or 0
            )
            track["last_det_score"] = float(
                detection.get("det_score") or 0.0
            )

            output.append(
                {
                    **detection,
                    "track_id": track_id,
                    "is_new_track": is_new_track,
                    "track": track,
                }
            )

        return output, expired_tracks

    def should_attempt_recognition(
        self,
        track_id,
        face_size,
        det_score,
        now=None,
    ):
        """
        Recognition tetap berulang sampai track berakhir, tetapi tidak pada
        setiap frame. Retry dilakukan jika:
        - interval status sudah tercapai; atau
        - ukuran wajah membaik signifikan; atau
        - detection score membaik signifikan.
        """
        track = self.tracks.get(track_id)

        if not track or track.get("finalized"):
            return False

        if (
            int(track.get("seen_count") or 0)
            < self.min_seen_count_for_recognition
        ):
            return False

        now = float(now if now is not None else time.time())
        last_at = float(track.get("last_recognition_at") or 0.0)

        if last_at <= 0:
            return True

        status = str(
            track.get("recognition_status") or "TRACKING"
        ).upper()

        if status == "KNOWN":
            interval = self.known_retry_interval
        elif status == "UNKNOWN":
            interval = self.unknown_retry_interval
        else:
            interval = self.ambiguous_retry_interval

        if now - last_at >= interval:
            return True

        current_size = int(face_size or 0)
        previous_size = int(
            track.get("last_recognition_face_size") or 0
        )

        if (
            previous_size > 0
            and current_size
            >= max(
                previous_size + 2,
                int(previous_size * self.force_size_growth_ratio),
            )
        ):
            return True

        current_det_score = float(det_score or 0.0)
        previous_det_score = float(
            track.get("last_recognition_det_score") or 0.0
        )

        if (
            current_det_score
            >= previous_det_score + self.force_det_score_delta
        ):
            return True

        return False

    def record_recognition(
        self,
        track_id,
        status,
        display_name,
        member_id=None,
        similarity=0.0,
        det_score=0.0,
        face_size=0,
        face_crop=None,
        embedding=None,
        recognized_at=None,
    ):
        """
        Simpan hasil recognition terbaru dan perbarui best_result jika lebih baik.

        Return:
            {
                "best_updated": bool,
                "status_changed": bool,
                "best_result": dict | None,
            }
        """
        track = self.tracks.get(track_id)

        if not track or track.get("finalized"):
            return {
                "best_updated": False,
                "status_changed": False,
                "best_result": None,
            }

        status = str(status or "AMBIGUOUS").upper()
        similarity = float(similarity or 0.0)
        det_score = float(det_score or 0.0)
        face_size = int(face_size or 0)

        previous_status = str(
            track.get("recognition_status") or "TRACKING"
        ).upper()

        track["recognition_attempts"] = (
            int(track.get("recognition_attempts") or 0) + 1
        )
        track["last_recognition_at"] = time.time()
        track["last_recognition_face_size"] = face_size
        track["last_recognition_det_score"] = det_score

        track["recognized"] = status == "KNOWN"
        track["recognition_status"] = status
        track["identity"] = display_name
        track["recognition_similarity"] = similarity
        track["candidate_member_id"] = member_id
        track["matched_member_id"] = (
            member_id if status == "KNOWN" else None
        )
        track["matched_name"] = display_name

        snapshot = {
            "status": status,
            "display_name": display_name,
            "member_id": member_id,
            "similarity": similarity,
            "det_score": det_score,
            "face_size": face_size,
            "face_crop": self._copy_array(face_crop),
            "embedding": self._copy_array(embedding),
            "recognized_at": recognized_at,
        }

        current_best = track.get("best_result")
        best_updated = False

        if (
            current_best is None
            or self._snapshot_score(snapshot)
            > self._snapshot_score(current_best)
        ):
            track["best_result"] = snapshot
            current_best = snapshot
            best_updated = True

        return {
            "best_updated": best_updated,
            "status_changed": previous_status != status,
            "best_result": current_best,
        }

    def get_best_result(self, track_id):
        track = self.tracks.get(track_id)

        if not track:
            return None

        return track.get("best_result")

    def finalize_all(self):
        """
        Ambil semua track aktif, kosongkan tracker, lalu kembalikan snapshotnya.
        Dipakai ketika session dihentikan.
        """
        tracks = list(self.tracks.values())
        self.tracks = {}
        return tracks

    @staticmethod
    def mark_finalized(track):
        if track is not None:
            track["finalized"] = True

    @staticmethod
    def mark_db_pushed(track):
        if track is not None:
            track["db_pushed"] = True

    def should_log(self, track_id, interval_seconds=1.5):
        now = time.time()
        track = self.tracks.get(track_id)

        if not track:
            return False

        last_log_at = float(track.get("last_log_at") or 0.0)

        if now - last_log_at >= interval_seconds:
            track["last_log_at"] = now
            return True

        return False
