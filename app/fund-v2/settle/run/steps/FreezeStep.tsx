"use client";

import { fmtAmount } from '@/lib/fund';
import { Amount, Card, Chip, SectionLabel } from '../../../ui';
import { digits, inputCls, StepNav } from '../shared';

export default function FreezeStep({
  main, total, rate, charter, reserve, future, isCharter, onCharter, onNone, onReserve, onFuture,
  zeroReason, onZeroReason, onBack, onNext,
}: {
  main: number; total: number; rate: number; charter: { reserve: number; future: number };
  reserve: string; future: string; isCharter: boolean;
  onCharter: () => void; onNone: () => void; onReserve: (v: string) => void; onFuture: (v: string) => void;
  zeroReason: string; onZeroReason: (v: string) => void; onBack: () => void; onNext: () => void;
}) {
  const r = Number(reserve) || 0; const f = Number(future) || 0;
  const zero = r === 0 && f === 0;
  const isNone = zero && !isCharter;
  const charterTotal = Math.floor(Math.max(0, total) * rate);
  const pct = Math.round(rate * 100);
  const over = r + f > 0 && r + f > main;
  const ok = !zero || zeroReason.trim() !== '';

  return (
    <div>
      <p className="text-sm text-gray-400 mb-3">步驟 2／4：凍存</p>
      <Card>
        <div className="flex justify-between items-baseline gap-3">
          <span className="text-sm text-gray-400">目前不凍結零用金</span>
          <Amount value={main} size="lg" />
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 mt-4">
        <Chip on={isCharter} onClick={onCharter}>照設定 {pct}%</Chip>
        <Chip on={isNone} onClick={onNone}>這次不凍存</Chip>
      </div>

      <SectionLabel>緊急應變備用金</SectionLabel>
      <input inputMode="numeric" value={reserve} onChange={(e) => onReserve(digits(e.target.value))} className={inputCls} />
      <SectionLabel>共存前瞻預算</SectionLabel>
      <input inputMode="numeric" value={future} onChange={(e) => onFuture(digits(e.target.value))} className={inputCls} />
      <p className="text-xs text-gray-500 mt-2">設定：零用金 × {pct}% = <span className="tabular-nums">{fmtAmount(charter.reserve)}</span>（各一筆）</p>

      {zero && (
        <>
          <SectionLabel>不凍存原因（必填）</SectionLabel>
          <input value={zeroReason} onChange={(e) => onZeroReason(e.target.value)} className={inputCls} />
        </>
      )}

      <Card className="mt-4">
        <div className="flex justify-between items-baseline gap-3">
          <span className="text-sm text-gray-400">凍存後不凍結零用金</span>
          <Amount value={main - r - f} size="lg" />
        </div>
        {over && <p className="text-[#FF0055] text-xs mt-1">凍存超過零用金</p>}
      </Card>
      <p className="text-xs text-gray-500 mt-3">
        章程：總餘款 {pct}%（小結 × {pct}% = <span className="tabular-nums">{fmtAmount(charterTotal)}</span>）
        {r !== charterTotal || f !== charterTotal
          ? <>；本次與章程差：緊急 <span className="tabular-nums">{fmtAmount(r - charterTotal)}</span>、前瞻 <span className="tabular-nums">{fmtAmount(f - charterTotal)}</span></>
          : null}
      </p>
      <StepNav onBack={onBack} onNext={onNext} disabled={!ok} />
    </div>
  );
}
