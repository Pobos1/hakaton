import { BookOpen } from "lucide-react";
import type { SearchHit } from "@/lib/api";

type Props = {
  citations: SearchHit[];
  title?: string;
};

export function SourcesList({
  citations,
  title = "Цитаты и источники",
}: Props) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-950">
        <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
        {title}
      </div>
      <ol className="list-decimal space-y-3 pl-5 text-sm text-neutral-800">
        {citations.map((c, i) => (
          <li key={`${c.book_title}-${i}-${c.text.slice(0, 24)}`}>
            <span className="font-medium text-neutral-900">{c.book_title}.</span>{" "}
            <span className="italic text-neutral-700">&ldquo;{c.text}&rdquo;</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
