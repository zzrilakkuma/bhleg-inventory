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

const C = { total: '#00FF41', main: '#8888ff', min: '#FFB000', neg: '#FF0055', gray: '#666666', grid: '#222222', text: '#9ca3af' };
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export interface LinePoint { label: string; endTotal: number; endMain: number; minMain: number }

/** 小結（綠）與零用金（紫）雙線；月內最低點以琥珀色方點標示。 */
export function LineChart({ series }: { series: LinePoint[] }) {
  if (!series.length) return <div className="text-sm text-gray-500">尚無資料</div>;
  const W = 340, H = 190, L = 44, R = 10, T = 12, B = 26;
  const vals = series.flatMap((p) => [p.endTotal, p.endMain, p.minMain]);
  const hi = Math.max(...vals, 0), lo = Math.min(...vals, 0);
  const span = hi - lo || 1;
  const x = (i: number) => L + (series.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1));
  const y = (v: number) => T + ((hi - v) / span) * (H - T - B);
  const line = (k: 'endTotal' | 'endMain') => series.map((p, i) => `${x(i)},${y(p[k])}`).join(' ');
  const step = Math.ceil(series.length / 5);
  const ticks = [hi, lo < 0 ? 0 : (hi + lo) / 2, lo];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="小結與零用金走勢">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={C.grid} />
          <text x={L - 4} y={y(t) + 4} textAnchor="end" fontSize="11" fill={C.text}>{fmt(t)}</text>
        </g>
      ))}
      {lo < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke={C.neg} strokeDasharray="3 3" />}
      <polyline points={line('endTotal')} fill="none" stroke={C.total} strokeWidth="2" />
      <polyline points={line('endMain')} fill="none" stroke={C.main} strokeWidth="2" />
      {series.map((p, i) => (
        <rect key={i} x={x(i) - 3.5} y={y(p.minMain) - 3.5} width="7" height="7" fill={C.min} stroke="#0a0a0a" strokeWidth="1.5" />
      ))}
      {series.map((p, i) => (i % step === 0 || i === series.length - 1) && (
        <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'} fontSize="11" fill={C.text}>
          {p.label.slice(2)}
        </text>
      ))}
    </svg>
  );
}

export function LineLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
      <span><span style={{ color: C.total }}>━</span> 小結</span>
      <span><span style={{ color: C.main }}>━</span> 零用金</span>
      <span><span style={{ color: C.min }}>■</span> 月內最低點</span>
    </div>
  );
}

/** 水平長條；單一強調色，值寫在長條右側。 */
export function BarChart({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const rowH = 28, W = 340, LW = 96, VW = 64;
  const bw = W - LW - VW;
  return (
    <svg viewBox={`0 0 ${W} ${items.length * rowH}`} className="w-full h-auto" role="img" aria-label="長條圖">
      {items.map((it, i) => {
        const w = Math.max(it.value > 0 ? 2 : 0, (it.value / max) * bw);
        return (
          <g key={it.label} transform={`translate(0 ${i * rowH})`}>
            <text x={LW - 6} y={18} textAnchor="end" fontSize="11" fill={C.text}>{it.label}</text>
            <rect x={LW} y={6} width={w} height={16} rx="2" fill={C.total} />
            <text x={LW + w + 5} y={18} fontSize="11" fill="#fff">{fmt(it.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

const SHARE_FILLS = ['#00FF41', '#8888ff', '#FFB000', '#FF0055', '#888888', '#555555'];

/** 單條 100% 堆疊條 + 圖例（圖例同時標出名稱與 %）。 */
export function StackedBar({ shares }: { shares: { label: string; pct: number; amount: number }[] }) {
  if (!shares.length) return <div className="text-sm text-gray-500">尚無資料</div>;
  let acc = 0;
  return (
    <div>
      <svg viewBox="0 0 340 26" className="w-full h-auto" role="img" aria-label="收入來源比例">
        {shares.map((s, i) => {
          const x = (acc / 100) * 340; acc += s.pct;
          return <rect key={s.label} x={x} y={2} width={Math.max(0, (s.pct / 100) * 340 - 2)} height={22} fill={SHARE_FILLS[Math.min(i, SHARE_FILLS.length - 1)]} />;
        })}
      </svg>
      <ul className="mt-2 space-y-1">
        {shares.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="inline-block w-3 h-3 shrink-0" style={{ background: SHARE_FILLS[Math.min(i, SHARE_FILLS.length - 1)] }} />
            <span className="text-gray-300 flex-1">{s.label}</span>
            <span className="font-mono tabular-nums text-gray-400">{fmt(s.amount)}</span>
            <span className="font-mono tabular-nums text-white w-14 text-right">{s.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
