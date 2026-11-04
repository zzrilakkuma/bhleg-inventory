"use client";

/** 近期 end_total 迷你長條（oldest → newest）。 */
export function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 200 / values.length;
  return (
    <svg viewBox="0 0 200 40" className="w-full h-10" role="img" aria-label="近期小結">
      {values.map((v, i) => {
        const h = Math.max(1, ((v - min) / span) * 38);
        return <rect key={i} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={h} fill="#00FF41" />;
      })}
    </svg>
  );
}
