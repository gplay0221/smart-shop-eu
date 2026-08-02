/**
 * Compact 7-point price trend for a product card.
 * The series is derived deterministically from the product id so the same
 * product always renders the same shape until real history data exists.
 */
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function buildTrend(seed: string, currentCents: number, points = 7) {
  const h = hash(seed);
  const series: number[] = [];
  for (let i = 0; i < points; i++) {
    const wobble = (((h >> (i * 3)) % 100) / 100 - 0.5) * 0.16;
    const drift = ((points - 1 - i) / points) * (((h % 7) - 3) / 100);
    series.push(Math.max(1, Math.round(currentCents * (1 + wobble + drift))));
  }
  series[points - 1] = currentCents;
  return series;
}

export function PriceSparkline({
  seed,
  currentCents,
  className = "",
}: {
  seed: string;
  currentCents: number;
  className?: string;
}) {
  const series = buildTrend(seed, currentCents);
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(1, max - min);
  const w = 100;
  const h = 28;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const down = series[series.length - 1] <= series[0];
  const stroke = down ? "var(--savings)" : "var(--berry)";
  const delta = Math.round(((series[series.length - 1] - series[0]) / series[0]) * 100);
  const gradId = `spark-${hash(seed)}`;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
        style={{ color: stroke, backgroundColor: down ? "var(--brand-soft)" : "var(--berry-soft)" }}
      >
        {delta > 0 ? "+" : ""}
        {delta}%
      </span>
    </div>
  );
}
