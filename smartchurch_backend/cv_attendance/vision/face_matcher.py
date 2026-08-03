import numpy as np

from ..utils.logger import get_logger
from .face_embedder import FaceEmbedder

logger = get_logger(__name__)


_NO_MATCH = {
    "identity_type": None,
    "identity_id": None,
    "member_id": None,
    "guest_id": None,
    "name": "Tidak Dikenal",
    "similarity": 0.0,
}


class FaceMatcher:
    """
    Matcher gabungan untuk:

    - MemberFaceEmbedding
    - Attendance Guest -> TimelineDataRecord.face_encoding

    Setiap reference wajib mempunyai:
    {
        "identity_type": "member" | "guest",
        "identity_id": int,
        "full_name": str,
        "face_encoding": list[float]
    }
    """

    def __init__(self):
        self._loaded = False
        self._embedding_matrix = None

        self._identity_types = []
        self._identity_ids = []
        self._names = []

        self._reference_counts = {
            "member": 0,
            "guest": 0,
        }

    def load_from_db(self, embeddings_data: list) -> None:
        embeddings = []
        identity_types = []
        identity_ids = []
        names = []

        reference_counts = {
            "member": 0,
            "guest": 0,
        }

        for row in embeddings_data:
            identity_type = str(
                row.get("identity_type") or ""
            ).strip().lower()

            # Backward compatibility untuk struktur lama.
            if identity_type not in {"member", "guest"}:
                if row.get("guest_id") is not None:
                    identity_type = "guest"
                else:
                    identity_type = "member"

            identity_id = row.get("identity_id")

            if identity_id is None:
                identity_id = row.get(
                    "guest_id"
                    if identity_type == "guest"
                    else "member_id"
                )

            try:
                if identity_id is None:
                    raise ValueError("identity_id kosong")

                vec = FaceEmbedder.from_list(
                    row["face_encoding"]
                )

                if not FaceEmbedder.is_valid(vec):
                    raise ValueError(
                        f"Dimensi embedding tidak valid: "
                        f"{getattr(vec, 'shape', None)}"
                    )

                vec = FaceEmbedder.normalize(
                    vec
                ).astype(np.float32)

                display_name = (
                    row.get("full_name")
                    or row.get("name")
                    or (
                        f"Guest #{identity_id}"
                        if identity_type == "guest"
                        else f"Member #{identity_id}"
                    )
                )

                embeddings.append(vec)
                identity_types.append(identity_type)
                identity_ids.append(int(identity_id))
                names.append(display_name)

                reference_counts[identity_type] += 1

            except Exception as exc:
                logger.warning(
                    "Skip face reference: "
                    f"type={identity_type} | "
                    f"id={identity_id} | "
                    f"error={exc}"
                )

        self._identity_types = identity_types
        self._identity_ids = identity_ids
        self._names = names
        self._reference_counts = reference_counts

        if embeddings:
            self._embedding_matrix = np.vstack(
                embeddings
            ).astype(np.float32)
        else:
            self._embedding_matrix = None

        self._loaded = True

        logger.info(
            "FaceMatcher loaded: "
            f"member_refs={reference_counts['member']} | "
            f"guest_refs={reference_counts['guest']} | "
            f"total={len(identity_ids)}"
        )

    def match(self, query_embedding: np.ndarray) -> dict:
        if (
            self._embedding_matrix is None
            or len(self._identity_ids) == 0
        ):
            logger.warning(
                "FaceMatcher belum di-load atau reference kosong."
            )
            return dict(_NO_MATCH)

        try:
            query = FaceEmbedder.normalize(
                query_embedding
            ).astype(np.float32)

            if not FaceEmbedder.is_valid(query):
                logger.warning(
                    "Query embedding tidak valid."
                )
                return dict(_NO_MATCH)

            similarities = self._embedding_matrix @ query

            best_index = int(np.argmax(similarities))
            best_similarity = float(
                similarities[best_index]
            )

            identity_type = self._identity_types[
                best_index
            ]
            identity_id = self._identity_ids[
                best_index
            ]

            return {
                "identity_type": identity_type,
                "identity_id": identity_id,
                "member_id": (
                    identity_id
                    if identity_type == "member"
                    else None
                ),
                "guest_id": (
                    identity_id
                    if identity_type == "guest"
                    else None
                ),
                "name": self._names[best_index],
                "similarity": best_similarity,
            }

        except Exception as exc:
            logger.error(
                f"FaceMatcher.match gagal: {exc}"
            )
            return dict(_NO_MATCH)

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def total_references(self) -> int:
        return len(self._identity_ids)

    @property
    def reference_counts(self) -> dict:
        return dict(self._reference_counts)