export function CubeMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2.5" fill="#e7ff3a" />
      <rect x="18" y="3" width="12" height="12" rx="2.5" fill="#f3f0e8" />
      <rect x="3" y="18" width="12" height="12" rx="2.5" fill="#f3f0e8" fillOpacity="0.72" />
      <rect x="18" y="18" width="12" height="12" rx="2.5" fill="#f3f0e8" fillOpacity="0.38" />
    </svg>
  );
}

const ACCENTS: Record<string, string> = {
  maestro: "#f3f0e8",
  focus: "#e7ff3a",
  money: "#8dffa8",
  work: "#9eb8ff",
  "job-hunt": "#f0d27a",
  body: "#ff9b7a",
  learn: "#d2a8ff",
  write: "#7ee7ff",
  "life-admin": "#ffc46b",
  calm: "#9ad7c8",
};

const FALLBACK = ["#e7ff3a", "#9eb8ff", "#ff9b7a", "#d2a8ff", "#7ee7ff", "#ffc46b"];

export function accentFor(slug: string): string {
  if (ACCENTS[slug]) return ACCENTS[slug];
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK[hash % FALLBACK.length];
}

export function CubeAvatar({ slug }: { slug: string }) {
  const color = accentFor(slug);
  return (
    <span
      className="grid h-7 w-7 shrink-0 grid-cols-2 gap-0.5 rounded-md p-1"
      style={{ background: `${color}22` }}
      aria-hidden="true"
    >
      <span className="rounded-[2px]" style={{ background: color }} />
      <span className="rounded-[2px] bg-white/80" />
      <span className="rounded-[2px] bg-white/55" />
      <span className="rounded-[2px] bg-white/30" />
    </span>
  );
}
