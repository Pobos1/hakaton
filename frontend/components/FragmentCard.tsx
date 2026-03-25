import type { SearchHit } from "@/lib/api";

type Props = {
  hit: SearchHit;
  index: number;
};

export function FragmentCard({ hit, index }: Props) {
  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">
          #{index}
        </span>
        <span className="font-medium text-neutral-900">{hit.book_title}</span>
        <span className="ml-auto tabular-nums">
          релев. {(hit.score * 100).toFixed(1)}%
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
        {hit.text}
      </p>
    </article>
  );
}
