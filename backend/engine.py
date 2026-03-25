from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import faiss
import numpy as np
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer


def _sanitize_filename(name: str) -> str:
    base = Path(name).name
    return re.sub(r"[^\w\s\-.]", "", base)[:200] or "document"


@dataclass
class SearchHit:
    book_title: str
    text: str
    score: float
    chunk_id: str


class RAGEngine:
    def __init__(
        self,
        data_dir: str | Path,
        embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
    ) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._index_path = self.data_dir / "faiss.index"
        self._meta_path = self.data_dir / "metadata.json"

        self.embedding_model_name = embedding_model_name
        self._model: SentenceTransformer | None = None
        self._dim: int | None = None
        self._index: faiss.Index | None = None
        self._metadata: list[dict[str, Any]] = []

        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=80,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        self._load_state()

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            self._model = SentenceTransformer(self.embedding_model_name)
            self._dim = int(self._model.get_sentence_embedding_dimension())
        return self._model

    @property
    def dim(self) -> int:
        if self._dim is None:
            _ = self.model
        assert self._dim is not None
        return self._dim

    def _load_state(self) -> None:
        if self._meta_path.exists():
            with open(self._meta_path, encoding="utf-8") as f:
                self._metadata = json.load(f)
        else:
            self._metadata = []

        if self._index_path.exists() and self._metadata:
            self._index = faiss.read_index(str(self._index_path))
        else:
            self._index = faiss.IndexFlatIP(self.dim)
            if not self._metadata:
                pass
            else:
                self._rebuild_index_from_metadata()

    def _rebuild_index_from_metadata(self) -> None:
        if not self._metadata:
            self._index = faiss.IndexFlatIP(self.dim)
            return
        texts = [m["text"] for m in self._metadata]
        embs = self._encode(texts)
        self._index = faiss.IndexFlatIP(self.dim)
        self._index.add(embs)

    def _persist(self) -> None:
        if self._index is not None and self._index.ntotal > 0:
            faiss.write_index(self._index, str(self._index_path))
        elif self._index_path.exists():
            self._index_path.unlink()
        with open(self._meta_path, "w", encoding="utf-8") as f:
            json.dump(self._metadata, f, ensure_ascii=False, indent=0)

    def _encode(self, texts: list[str]) -> np.ndarray:
        emb = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return np.asarray(emb, dtype=np.float32)

    def ingest_txt(self, filename: str, raw_text: str) -> dict[str, Any]:
        book_title = Path(_sanitize_filename(filename)).stem
        chunks = self._splitter.split_text(raw_text)
        if not chunks:
            return {"book_title": book_title, "chunks_added": 0, "message": "Пустой текст"}

        if self._index is None or self._index.ntotal == 0:
            if self._metadata:
                self._rebuild_index_from_metadata()
            else:
                self._index = faiss.IndexFlatIP(self.dim)

        vectors = self._encode(chunks)
        self._index.add(vectors)

        for ch in chunks:
            self._metadata.append(
                {
                    "chunk_id": str(uuid.uuid4()),
                    "book_title": book_title,
                    "text": ch,
                }
            )

        self._persist()
        return {"book_title": book_title, "chunks_added": len(chunks)}

    def search(
        self,
        query: str,
        top_k: int = 5,
        min_score: float = 0.25,
    ) -> list[SearchHit]:
        if self._index is None or self._index.ntotal == 0:
            return []

        q = self._encode([query])
        scores, indices = self._index.search(q, min(top_k, self._index.ntotal))
        hits: list[SearchHit] = []
        for rank, idx in enumerate(indices[0]):
            if idx < 0 or idx >= len(self._metadata):
                continue
            score = float(scores[0][rank])
            if score < min_score:
                continue
            m = self._metadata[idx]
            hits.append(
                SearchHit(
                    book_title=m["book_title"],
                    text=m["text"],
                    score=score,
                    chunk_id=m["chunk_id"],
                )
            )
        return hits

    def chunk_count(self) -> int:
        return len(self._metadata)

    def list_books(self) -> list[dict[str, Any]]:
        counts: dict[str, int] = {}
        for m in self._metadata:
            title = str(m.get("book_title", "")).strip()
            if not title:
                continue
            counts[title] = counts.get(title, 0) + 1
        return [
            {"book_title": title, "chunks": count}
            for title, count in sorted(counts.items(), key=lambda x: x[0])
        ]

    def delete_book(self, book_title: str) -> dict[str, Any]:
        book_title = str(book_title).strip()
        if not book_title:
            return {"book_title": book_title, "chunks_deleted": 0, "message": "Некорректное имя книги"}

        before = len(self._metadata)
        if before == 0:
            return {"book_title": book_title, "chunks_deleted": 0, "message": "Индекс пуст"}

        self._metadata = [m for m in self._metadata if m.get("book_title") != book_title]
        after = len(self._metadata)
        deleted = before - after

        if deleted <= 0:
            return {"book_title": book_title, "chunks_deleted": 0, "message": "Книга не найдена"}

        self._rebuild_index_from_metadata()
        self._persist()
        return {"book_title": book_title, "chunks_deleted": deleted}

    def clear_books(self) -> dict[str, Any]:
        deleted = len(self._metadata)
        self._metadata = []
        self._index = None
        self._persist()
        return {"chunks_deleted": deleted}


def get_engine() -> RAGEngine:
    data_dir = os.getenv("DATA_DIR", "./data")
    emb = os.getenv(
        "EMBEDDING_MODEL",
        "sentence-transformers/all-MiniLM-L6-v2",
    )
    return RAGEngine(data_dir=data_dir, embedding_model_name=emb)
