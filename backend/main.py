from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq
from pydantic import BaseModel, Field

from engine import RAGEngine, SearchHit, get_engine

load_dotenv()

app = FastAPI(title="Book RAG API", version="1.0.0")

_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
allow_origins = [o.strip() for o in _origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins or ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_rag_singleton: RAGEngine | None = None


def rag_engine() -> RAGEngine:
    global _rag_singleton
    if _rag_singleton is None:
        _rag_singleton = get_engine()
    return _rag_singleton


def groq_client() -> Groq:
    key = os.getenv("GROQ_API_KEY")
    if not key:
        raise HTTPException(
            status_code=503,
            detail="GROQ_API_KEY не задан. Добавьте ключ в backend/.env",
        )
    return Groq(api_key=key)


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=3, le=10)


class SearchHitResponse(BaseModel):
    book_title: str
    text: str
    score: float


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHitResponse]
    message: str | None = None


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=3, le=8)


class CitationResponse(BaseModel):
    book_title: str
    text: str
    score: float


class AskResponse(BaseModel):
    question: str
    answer: str
    citations: list[CitationResponse]
    message: str | None = None


class BookInfoResponse(BaseModel):
    book_title: str
    chunks: int


class BooksResponse(BaseModel):
    books: list[BookInfoResponse]
    total_chunks: int


class DeleteBookResponse(BaseModel):
    book_title: str
    chunks_deleted: int


class ClearBooksResponse(BaseModel):
    chunks_deleted: int


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Имя файла не указано")
    if not file.filename.lower().endswith(".txt"):
        raise HTTPException(status_code=400, detail="Допускаются только .txt файлы")

    try:
        raw_bytes = await file.read()
        text = raw_bytes.decode("utf-8", errors="replace")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Не удалось прочитать файл: {e}") from e

    if not text.strip():
        raise HTTPException(status_code=400, detail="Файл пустой или не содержит текста")

    try:
        result = rag_engine().ingest_txt(file.filename, text)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка индексации: {e!s}",
        ) from e

    return {"ok": True, **result}


@app.post("/search", response_model=SearchResponse)
def search_route(body: SearchRequest) -> SearchResponse:
    eng = rag_engine()
    if eng.chunk_count() == 0:
        return SearchResponse(
            query=body.query,
            hits=[],
            message="В индексе пока нет книг. Загрузите .txt файлы.",
        )

    try:
        hits = eng.search(body.query.strip(), top_k=body.top_k)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка поиска: {e!s}") from e

    if not hits:
        return SearchResponse(
            query=body.query,
            hits=[],
            message="Не найдено релевантных фрагментов в загруженных книгах.",
        )

    return SearchResponse(
        query=body.query,
        hits=[
            SearchHitResponse(book_title=h.book_title, text=h.text, score=h.score)
            for h in hits
        ],
    )


def _build_context(hits: list[SearchHit]) -> str:
    parts: list[str] = []
    for i, h in enumerate(hits, start=1):
        parts.append(f"[{i}] ({h.book_title}):\n{h.text}")
    return "\n\n".join(parts)


@app.post("/ask", response_model=AskResponse)
def ask_route(body: AskRequest) -> AskResponse:
    eng = rag_engine()
    if eng.chunk_count() == 0:
        return AskResponse(
            question=body.question,
            answer="",
            citations=[],
            message="В индексе нет данных. Сначала загрузите хотя бы одну книгу (.txt).",
        )

    try:
        hits = eng.search(body.question.strip(), top_k=body.top_k)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка поиска: {e!s}") from e

    if not hits:
        return AskResponse(
            question=body.question,
            answer="",
            citations=[],
            message="В загруженных текстах не найдено подходящих фрагментов для ответа.",
        )

    context = _build_context(hits)
    model = os.getenv("GROQ_MODEL", "llama3-8b-8192")

    system_prompt = (
        "Ты помощник по книгам. Отвечай только на основе переданного контекста. "
        "Если в контексте нет ответа, напиши явно, что в предоставленных фрагментах "
        "этого нет. Пиши по-русски, кратко и по делу. Не выдумывай факты."
    )
    user_prompt = (
        f"Контекст из книг:\n{context}\n\n"
        f"Вопрос: {body.question}\n\n"
        "Дай ответ, опираясь только на фрагменты выше."
    )

    try:
        client = groq_client()
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=1024,
        )
    except Exception as e:
        err = str(e).lower()
        if "api key" in err or "401" in err or "403" in err:
            raise HTTPException(
                status_code=503,
                detail="Groq API: проверьте ключ GROQ_API_KEY в .env",
            ) from e
        raise HTTPException(
            status_code=503,
            detail=f"Groq недоступен или вернула ошибку: {e!s}",
        ) from e

    choice = completion.choices[0].message
    answer_text = (choice.content or "").strip()
    if not answer_text:
        return AskResponse(
            question=body.question,
            answer="",
            citations=[
                CitationResponse(book_title=h.book_title, text=h.text, score=h.score)
                for h in hits
            ],
            message="Модель не вернула текст ответа. Ниже — фрагменты, которые использовались как контекст.",
        )

    citations = [
        CitationResponse(book_title=h.book_title, text=h.text, score=h.score)
        for h in hits
    ]
    return AskResponse(question=body.question, answer=answer_text, citations=citations)


@app.get("/books", response_model=BooksResponse)
def list_books_route() -> BooksResponse:
    eng = rag_engine()
    books = eng.list_books()
    return BooksResponse(
        books=[BookInfoResponse(**b) for b in books],
        total_chunks=eng.chunk_count(),
    )


@app.delete("/books/{book_title}", response_model=DeleteBookResponse)
def delete_book_route(book_title: str) -> DeleteBookResponse:
    eng = rag_engine()
    result = eng.delete_book(book_title)
    deleted = int(result.get("chunks_deleted", 0))
    if deleted <= 0:
        raise HTTPException(status_code=404, detail=result.get("message") or "Книга не найдена")
    return DeleteBookResponse(book_title=result["book_title"], chunks_deleted=deleted)


@app.delete("/books", response_model=ClearBooksResponse)
def clear_books_route() -> ClearBooksResponse:
    eng = rag_engine()
    result = eng.clear_books()
    return ClearBooksResponse(chunks_deleted=int(result.get("chunks_deleted", 0)))
