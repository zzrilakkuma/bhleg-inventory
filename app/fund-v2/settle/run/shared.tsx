"use client";

export const inputCls = 'w-full bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none tabular-nums';
export const digits = (v: string) => v.replace(/[^\d]/g, '');
export const signedDigits = (v: string) => v.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');

export interface WrittenRepayment { id: number; lender: string; amount: number; fee: number; remaining: number }
export interface Step1Written {
  claim: { id: number; count: number; sum: number } | null;
  repayments: WrittenRepayment[];
}

export function StepNav({ onBack, onNext, nextLabel = '下一步', disabled, busy, primary }: {
  onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean; busy?: boolean; primary?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2 mt-6">
      {onBack && (
        <button type="button" onClick={onBack} disabled={busy}
          className="w-full sm:flex-1 py-3 rounded border border-[#333333] text-gray-300 text-base disabled:opacity-40">
          上一步
        </button>
      )}
      <button type="button" onClick={onNext} disabled={disabled || busy}
        className={`w-full sm:flex-1 py-3 rounded border border-[#00FF41] text-[#00FF41] text-base disabled:opacity-40 ${primary ? 'bg-[rgba(0,255,65,0.1)] font-semibold' : ''}`}>
        {busy ? '寫入中...' : nextLabel}
      </button>
    </div>
  );
}
