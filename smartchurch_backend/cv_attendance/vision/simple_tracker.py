#smartchurch_backend\cv_attendance\vision\simple_tracker.py
import time
import uuid

import numpy as np


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
    def __init__(
        self,
        iou_threshold=0.18,
        max_center_distance=80,
        max_lost_seconds=1.0,
    ):
        self.iou_threshold = iou_threshold
        self.max_center_distance = max_center_distance
        self.max_lost_seconds = max_lost_seconds
        self.tracks = {}

    def update(self, detections):
        now = time.time()

        expired_ids = [
            track_id
            for track_id, track in self.tracks.items()
            if now - track["last_seen"] > self.max_lost_seconds
        ]

        for track_id in expired_ids:
            del self.tracks[track_id]

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

                if iou >= self.iou_threshold or dist <= self.max_center_distance:
                    distance_score = max(
                        0.0,
                        1.0 - (dist / max(self.max_center_distance, 1)),
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
                    "seen_count": 1,
                    "recognized": False,
                    "identity": None,
                    "recognition_status": "unrecognized",
                    "recognition_similarity": 0.0,
                    "matched_member_id": None,
                    "matched_name": None,
                    "db_pushed": False,
                    "last_log_at": 0.0,
                }

                is_new_track = True

            else:
                track_id = best_track_id
                track = self.tracks[track_id]

                track["bbox"] = bbox
                track["last_seen"] = now
                track["seen_count"] = track.get("seen_count", 0) + 1

                is_new_track = False

            assigned_track_ids.add(track_id)

            track = self.tracks[track_id]

            output.append(
                {
                    **detection,
                    "track_id": track_id,
                    "is_new_track": is_new_track,
                    "track": track,
                }
            )

        return output

    def set_identity(
        self,
        track_id,
        status,
        display_name,
        member_id=None,
        similarity=0.0,
    ):
        track = self.tracks.get(track_id)

        if not track:
            return

        track["recognized"] = True
        track["recognition_status"] = status
        track["identity"] = display_name
        track["recognition_similarity"] = float(similarity or 0.0)
        track["matched_member_id"] = member_id
        track["matched_name"] = display_name

    def mark_db_pushed(self, track_id):
        track = self.tracks.get(track_id)

        if track:
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