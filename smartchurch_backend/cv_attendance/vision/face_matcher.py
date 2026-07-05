#smartchurch_backend\cv_attendance\vision\face_matcher.py

import numpy as np

from ..utils.logger import get_logger
from .face_embedder import FaceEmbedder

logger = get_logger(__name__)

_NO_MATCH = {
    "member_id": None,
    "name": "Tidak Dikenal",
    "similarity": 0.0,
}


class FaceMatcher:
    def __init__(self):
        self._loaded = False
        self._embedding_matrix = None
        self._member_ids = []
        self._names = []

    def load_from_db(self, embeddings_data: list) -> None:
        embeddings = []
        member_ids = []
        names = []

        for row in embeddings_data:
            try:
                vec = FaceEmbedder.from_list(row["face_encoding"])
                vec = FaceEmbedder.normalize(vec).astype(np.float32)

                embeddings.append(vec)
                member_ids.append(row["member_id"])
                names.append(row["full_name"])

            except Exception as exc:
                logger.warning(
                    f"Skip embedding member_id={row.get('member_id')}: {exc}"
                )

        self._member_ids = member_ids
        self._names = names

        if embeddings:
            self._embedding_matrix = np.vstack(embeddings).astype(np.float32)
        else:
            self._embedding_matrix = None

        self._loaded = True

        logger.info(
            f"FaceMatcher: {len(self._member_ids)} embedding dimuat "
            "dengan matrix matching."
        )

    def match(self, query_embedding: np.ndarray) -> dict:
        if self._embedding_matrix is None or len(self._member_ids) == 0:
            logger.warning("FaceMatcher belum di-load atau kosong.")
            return _NO_MATCH

        query = FaceEmbedder.normalize(query_embedding).astype(np.float32)

        sims = self._embedding_matrix @ query

        best_index = int(np.argmax(sims))
        best_sim = float(sims[best_index])

        return {
            "member_id": self._member_ids[best_index],
            "name": self._names[best_index],
            "similarity": best_sim,
        }

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def total_references(self) -> int:
        return len(self._member_ids)