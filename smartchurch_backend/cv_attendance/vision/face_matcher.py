# cv_attendance/vision/face_matcher.py
import numpy as np
from .face_embedder import FaceEmbedder        # ← relative
from ..utils.logger import get_logger           # ← relative

logger = get_logger(__name__)

_NO_MATCH = {"member_id": None, "name": "Tidak Dikenal", "similarity": 0.0}


class FaceMatcher:
    def __init__(self):
        self._references: list = []
        self._loaded = False

    def load_from_db(self, embeddings_data: list) -> None:
        """
        Load embedding dari Django ORM result ke memory.
        embeddings_data: list of {member_id, full_name, face_encoding}
        """
        self._references = []
        for row in embeddings_data:
            try:
                vec = FaceEmbedder.from_list(row["face_encoding"])
                vec = FaceEmbedder.normalize(vec)
                self._references.append({
                    "member_id": row["member_id"],
                    "name":      row["full_name"],
                    "embedding": vec,
                })
            except Exception as e:
                logger.warning(f"Skip embedding member_id={row.get('member_id')}: {e}")

        self._loaded = True
        logger.info(f"FaceMatcher: {len(self._references)} embedding dimuat")

    def match(self, query_embedding: np.ndarray) -> dict:
        if not self._references:
            logger.warning("FaceMatcher belum di-load")
            return _NO_MATCH

        query    = FaceEmbedder.normalize(query_embedding)
        best_sim = -1.0
        best_ref = None

        for ref in self._references:
            sim = float(np.dot(query, ref["embedding"])) # menghitung cosine similarity
            if sim > best_sim:
                best_sim = sim
                best_ref = ref

        if best_ref is None:
            return _NO_MATCH

        return {
            "member_id":  best_ref["member_id"],
            "name":       best_ref["name"],
            "similarity": best_sim,
        }

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def total_references(self) -> int:
        return len(self._references)