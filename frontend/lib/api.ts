const DEFAULT_API = "http://localhost:8000";

export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API;
}

export type SearchHit = {
  book_title: string;
  text: string;
  score: number;
};

export type SearchResponse = {
  query: string;
  hits: SearchHit[];
  message?: string | null;
};

export type AskResponse = {
  question: string;
  answer: string;
  citations: SearchHit[];
  message?: string | null;
};

export type BookInfo = {
  book_title: string;
  chunks: number;
};

export type BooksResponse = {
  books: BookInfo[];
  total_chunks: number;
};

export async function uploadTxt(file: File): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${apiBase()}/upload`, {
    method: "POST",
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : Array.isArray(data?.detail)
          ? data.detail.map((d: { msg?: string }) => d.msg).join("; ")
          : res.statusText;
    throw new Error(detail || `Ошибка загрузки (${res.status})`);
  }
  return data;
}

export async function searchFragments(
  query: string,
  topK = 5,
): Promise<SearchResponse> {
  const res = await fetch(`${apiBase()}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Ошибка поиска (${res.status})`,
    );
  }
  return data as SearchResponse;
}

export async function askRag(question: string, topK = 5): Promise<AskResponse> {
  const res = await fetch(`${apiBase()}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: topK }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Ошибка ответа (${res.status})`,
    );
  }
  return data as AskResponse;
}

export async function listBooks(): Promise<BooksResponse> {
  const res = await fetch(`${apiBase()}/books`, { method: "GET" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Ошибка списка книг (${res.status})`,
    );
  }
  return data as BooksResponse;
}

export async function deleteBook(bookTitle: string): Promise<{
  book_title: string;
  chunks_deleted: number;
}> {
  const res = await fetch(`${apiBase()}/books/${encodeURIComponent(bookTitle)}`, {
    method: "DELETE",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Ошибка удаления книги (${res.status})`,
    );
  }
  return data;
}

export async function clearBooks(): Promise<{ chunks_deleted: number }> {
  const res = await fetch(`${apiBase()}/books`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Ошибка очистки (${res.status})`,
    );
  }
  return data as { chunks_deleted: number };
}
