interface ScoreDialProps {
  score: number;
  max: number;
}

function toneFor(pct: number): { ring: string; text: string; label: string } {
  if (pct >= 80) return { ring: "#16a34a", text: "text-green-700", label: "Strong" };
  if (pct >= 60) return { ring: "#f97316", text: "text-brand-700", label: "Good, with gaps" };
  if (pct >= 40) return { ring: "#f59e0b", text: "text-amber-700", label: "Needs work" };
  return { ring: "#dc2626", text: "text-red-700", label: "At risk" };
}

/** Circular score gauge rendered with an SVG stroke-dasharray arc. */
export function ScoreDial({ score, max }: ScoreDialProps) {
  const pct = Math.round((score / max) * 100);
  const tone = toneFor(pct);
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-52 w-52">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="16"
          />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={tone.ring}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-extrabold text-ink">{score}</span>
          <span className="text-sm text-ink-muted">out of {max}</span>
        </div>
      </div>
      <span className={`mt-3 text-sm font-semibold ${tone.text}`}>
        {tone.label}
      </span>
    </div>
  );
}
