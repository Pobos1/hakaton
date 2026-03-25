import { AlertCircle, User } from "lucide-react";
import type { SearchHit } from "@/lib/api";
import { FragmentCard } from "./FragmentCard";
import { SourcesList } from "./SourcesList";

export type ChatBubble = {
  id: string;
  role: "user" | "assistant";
  content: string;
  hits?: SearchHit[];
  citations?: SearchHit[];
  isError?: boolean;
  systemNote?: string | null;
};

type Props = {
  message: ChatBubble;
};

export function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
          isUser
            ? "border-blue-100 bg-blue-50 text-blue-700"
            : "border-neutral-200 bg-white text-neutral-600"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" aria-hidden />
        ) : (
          <span className="text-xs font-semibold">AI</span>
        )}
      </div>
      <div
        className={`max-w-[min(100%,42rem)] space-y-3 ${
          isUser ? "items-end" : "items-start"
        } flex flex-col`}
      >
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-blue-600 text-white"
              : message.isError
                ? "border border-red-200 bg-red-50 text-red-900"
                : "border border-[var(--border)] bg-[var(--surface)] text-neutral-800"
          }`}
        >
          {message.isError && (
            <AlertCircle className="mr-2 inline h-4 w-4 align-text-bottom text-red-600" />
          )}
          {message.content || "—"}
        </div>

        {message.systemNote ? (
          <p className="max-w-xl text-xs text-[var(--muted)]">{message.systemNote}</p>
        ) : null}

        {message.hits && message.hits.length > 0 ? (
          <div className="w-full max-w-xl space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Фрагменты
            </p>
            {message.hits.map((h, i) => (
              <FragmentCard key={`${h.book_title}-${i}`} hit={h} index={i + 1} />
            ))}
          </div>
        ) : null}

        {message.citations && message.citations.length > 0 ? (
          <div className="w-full max-w-xl">
            <SourcesList citations={message.citations} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
