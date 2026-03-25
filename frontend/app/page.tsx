"use client";

import {
  Loader2,
  MessageSquareText,
  Search,
  SendHorizontal,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage, type ChatBubble } from "@/components/ChatMessage";
import {
  apiBase,
  askRag,
  clearBooks,
  deleteBook,
  listBooks,
  searchFragments,
  uploadTxt,
  type BookInfo,
} from "@/lib/api";

type Mode = "search" | "ask";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("ask");
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [booksLoading, setBooksLoading] = useState(false);
  const [booksError, setBooksError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const appendMessage = useCallback((m: ChatBubble) => {
    setMessages((prev) => [...prev, m]);
    requestAnimationFrame(scrollToBottom);
  }, [scrollToBottom]);

  const refreshBooks = useCallback(async () => {
    setBooksLoading(true);
    setBooksError(null);
    try {
      const res = await listBooks();
      setBooks(res.books);
    } catch (e) {
      setBooksError(e instanceof Error ? e.message : "Ошибка загрузки книг");
    } finally {
      setBooksLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBooks();
  }, [refreshBooks]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    appendMessage({
      id: newId(),
      role: "user",
      content: text,
    });
    setInput("");
    setLoading(true);

    try {
      if (mode === "search") {
        const res = await searchFragments(text, 5);
        appendMessage({
          id: newId(),
          role: "assistant",
          content:
            res.hits.length > 0
              ? "Вот наиболее релевантные фрагменты из загруженных книг."
              : "Подходящих фрагментов не найдено.",
          hits: res.hits,
          systemNote: res.message ?? null,
        });
      } else {
        const res = await askRag(text, 5);
        const hasCitations = (res.citations?.length ?? 0) > 0;
        const hasAnswer = res.answer.trim().length > 0;

        appendMessage({
          id: newId(),
          role: "assistant",
          content: hasAnswer
            ? res.answer
            : res.message ??
              (hasCitations
                ? "Ниже — точные цитаты из книг, на которые опирался контекст для ответа."
                : "В загруженных книгах нет подходящего ответа или фрагментов."),
          citations: res.citations,
          systemNote: hasAnswer ? (res.message ?? null) : null,
          isError: !hasAnswer && !hasCitations,
        });
      }
    } catch (err) {
      appendMessage({
        id: newId(),
        role: "assistant",
        content:
          err instanceof Error
            ? err.message
            : "Произошла неизвестная ошибка сети или сервера.",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".txt")) {
          setUploadError("Можно загружать только .txt файлы.");
          continue;
        }
        await uploadTxt(file);
      }
      appendMessage({
        id: newId(),
        role: "assistant",
        content: `Файл(ы) загружены и проиндексированы.`,
      });
      await refreshBooks();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 md:px-8">
      <header className="mb-8 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-3xl">
          Умный поиск по книгам
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Загрузите .txt, затем ищите цитаты или задавайте вопросы — ответы
          строятся из ваших текстов (RAG). API:{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
            {apiBase()}
          </code>
        </p>
      </header>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <label className="flex cursor-pointer flex-col justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-6 transition-colors hover:border-blue-400 hover:bg-blue-50/30">
          <input
            type="file"
            accept=".txt,text/plain"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => onFiles(e.target.files)}
          />
          <div className="flex items-center gap-3 text-neutral-700">
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            ) : (
              <UploadCloud className="h-8 w-8 text-blue-600" />
            )}
            <div>
              <p className="font-medium">Загрузка книг (.txt)</p>
              <p className="text-xs text-[var(--muted)]">
                Текст разбивается на фрагменты и индексируется локально
              </p>
            </div>
          </div>
        </label>

        <div className="flex flex-col justify-center rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Режим
          </p>
          <div className="flex rounded-xl bg-neutral-100 p-1">
            <button
              type="button"
              onClick={() => setMode("ask")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                mode === "ask"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <MessageSquareText className="h-4 w-4" />
              Вопрос
            </button>
            <button
              type="button"
              onClick={() => setMode("search")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                mode === "search"
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900"
              }`}
            >
              <Search className="h-4 w-4" />
              Фрагменты
            </button>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            {mode === "search"
              ? "Например: «Найди, где говорится про…» — вернём 3–5 отрывков с названием книги."
              : "Вопрос к модели Llama 3 через Groq с контекстом из найденных фрагментов."}
          </p>
        </div>
      </div>

      {uploadError ? (
        <p className="mb-4 text-sm text-red-600">{uploadError}</p>
      ) : null}

      <section className="mb-6 rounded-2xl border border-[var(--border)] bg-white/70 p-4 md:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              Загруженные книги
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {booksLoading
                ? "Загрузка..."
                : books.length > 0
                  ? `Всего: ${books.length}`
                  : "Пока ничего не загружено"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => refreshBooks()}
            disabled={booksLoading}
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {booksLoading ? "..." : "Обновить"}
          </button>
        </div>

        {booksError ? (
          <p className="mb-3 text-sm text-red-600">{booksError}</p>
        ) : null}

        {books.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted)]">
            Загрузите `.txt` файлы, чтобы появились книги.
          </p>
        ) : (
          <div className="space-y-2">
            {books.map((b) => (
              <div
                key={b.book_title}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {b.book_title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {b.chunks} фрагментов
                  </p>
                </div>

                <button
                  type="button"
                  disabled={booksLoading}
                  onClick={async () => {
                    const ok = window.confirm(
                      `Удалить книгу "${b.book_title}"?`,
                    );
                    if (!ok) return;

                    try {
                      await deleteBook(b.book_title);
                      await refreshBooks();
                      appendMessage({
                        id: newId(),
                        role: "assistant",
                        content: `Книга "${b.book_title}" удалена.`,
                      });
                    } catch (e) {
                      setBooksError(
                        e instanceof Error ? e.message : "Ошибка удаления",
                      );
                    }
                  }}
                  className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            ))}
          </div>
        )}

        {books.length > 0 ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={booksLoading}
              onClick={async () => {
                const ok = window.confirm("Очистить все загруженные книги?");
                if (!ok) return;

                try {
                  await clearBooks();
                  await refreshBooks();
                  appendMessage({
                    id: newId(),
                    role: "assistant",
                    content: "Все книги очищены.",
                  });
                } catch (e) {
                  setBooksError(
                    e instanceof Error ? e.message : "Ошибка очистки",
                  );
                }
              }}
              className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Очистить всё
            </button>
          </div>
        ) : null}
      </section>

      <div className="min-h-[320px] flex-1 space-y-6 overflow-y-auto rounded-2xl border border-[var(--border)] bg-white/70 p-4 md:p-6">
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--muted)]">
            Загрузите книгу и отправьте запрос — здесь появится диалог.
          </p>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-6 flex shrink-0 gap-2 border-t border-transparent pt-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            mode === "search"
              ? "Найди, где говорится про…"
              : "Задайте вопрос по содержанию книг…"
          }
          className="flex-1 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none ring-blue-500/30 placeholder:text-neutral-400 focus:ring-2"
          disabled={loading}
          aria-label="Сообщение"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
          Отправить
        </button>
      </form>
    </div>
  );
}
