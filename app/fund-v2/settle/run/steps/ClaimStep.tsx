"use client";

import { fmtAmount } from '@/lib/fund';
import type { OutstandingLoan, Snapshot, UnclaimedExpense } from '@/lib/fund-v2/api';
import { step1Delta } from '@/lib/fund-v2/settlement';
import type { FundStorage } from '@/lib/fund';
import { Amount, Card, Chip, SectionLabel } from '../../../ui';
import { digits, inputCls, StepNav, type Step1Written } from '../shared';

export type RepayDraft = Record<number, { amount: string; fee: string }>;

const shortDate = (iso: string) => iso.slice(5).replace('-', '/').replace(/^0/, '');

export default function ClaimStep({
  snapshot, unclaimed, loans, checked, onToggle, storages, storageId, onStorage, repay, onRepay,
  written, busy, onNext,
}: {
  snapshot: Snapshot | null; unclaimed: UnclaimedExpense[]; loans: OutstandingLoan[];
  checked: Set<number>; onToggle: (id: number) => void;
  storages: FundStorage[]; storageId: number | null; onStorage: (id: number) => void;
  repay: RepayDraft; onRepay: (loanId: number, field: 'amount' | 'fee', v: string) => void;
  written: Step1Written | null; busy: boolean; onNext: () => void;
}) {
  if (written) {
    return (
      <div>
        <p className="text-sm text-gray-400 mb-3">步驟 1／4：這次要入帳的代墊與還款</p>
        <Card>
          <div className="text-xs text-gray-500 mb-2">已入帳（回上一步不會取消）</div>
          <ul className="divide-y divide-[#222222] text-sm">
            {written.claim && (
              <li className="flex justify-between py-2 gap-3">
                <span className="text-white">代墊請款（{written.claim.count} 筆）</span>
                <Amount value={written.claim.sum} size="sm" />
              </li>
            )}
            {written.repayments.map((r) => (
              <li key={r.id} className="flex justify-between py-2 gap-3">
                <span className="text-white">還款 {r.lender}{r.fee ? <span className="text-gray-500 text-xs ml-2">手續費 {r.fee}</span> : null}</span>
                <Amount value={-(r.amount + r.fee)} size="sm" />
              </li>
            ))}
          </ul>
        </Card>
        <Summary snapshot={snapshot} delta={0} />
        <StepNav onNext={onNext} />
      </div>
    );
  }

  const selected = unclaimed.filter((e) => checked.has(e.transaction_id));
  const repayList = loans.map((l) => ({ loan: l, amount: Number(repay[l.loan_id]?.amount) || 0, fee: Number(repay[l.loan_id]?.fee) || 0 }));
  const over = repayList.find((r) => r.amount > r.loan.remaining);
  const delta = step1Delta(selected, repayList);

  return (
    <div>
      <p className="text-sm text-gray-400 mb-3">步驟 1／4：這次要入帳的代墊與還款</p>

      <SectionLabel>未請款代墊</SectionLabel>
      {unclaimed.length === 0 ? (
        <p className="text-sm text-gray-500">沒有未請款的代墊</p>
      ) : (
        <ul className="divide-y divide-[#222222] border border-[#333333] rounded">
          {unclaimed.map((e) => {
            const on = checked.has(e.transaction_id);
            return (
              <li key={e.transaction_id}>
                <label className="flex items-center gap-3 px-3 py-3 cursor-pointer">
                  <input type="checkbox" checked={on} onChange={() => onToggle(e.transaction_id)}
                    className="w-5 h-5 accent-[#00FF41] shrink-0" />
                  <span className={`flex-1 min-w-0 text-sm ${on ? 'text-white' : 'text-gray-500'}`}>
                    <span className="block truncate">{e.vendor ?? e.title.split('\n')[0]}</span>
                    <span className="text-xs text-gray-500">{shortDate(e.stated_on ?? e.occurred_on)}{on ? '' : '（下期再說）'}</span>
                  </span>
                  <Amount value={-Math.abs(e.amount)} size="sm" />
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {selected.length > 0 && (
        <>
          <SectionLabel>請款從哪裡出</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {storages.map((s) => <Chip key={s.id} on={storageId === s.id} onClick={() => onStorage(s.id)}>{s.name}</Chip>)}
          </div>
        </>
      )}

      {loans.length > 0 && (
        <>
          <SectionLabel>還款（不還就留 0）</SectionLabel>
          <div className="space-y-3">
            {loans.map((l) => (
              <div key={l.loan_id} className="border border-[#333333] rounded p-3">
                <div className="flex justify-between text-sm mb-2 gap-3">
                  <span className="text-white">{l.lender_name}</span>
                  <span className="text-gray-500 text-xs">剩餘 <span className="tabular-nums">{fmtAmount(l.remaining)}</span></span>
                </div>
                <div className="grid grid-cols-[1fr_7rem] gap-2">
                  <input inputMode="numeric" placeholder="本金 0" value={repay[l.loan_id]?.amount ?? ''}
                    onChange={(e) => onRepay(l.loan_id, 'amount', digits(e.target.value))} className={inputCls} />
                  <input inputMode="numeric" placeholder="手續費 0" value={repay[l.loan_id]?.fee ?? ''}
                    onChange={(e) => onRepay(l.loan_id, 'fee', digits(e.target.value))} className={inputCls} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">還款從上面選的存放位置出（{storages.find((s) => s.id === storageId)?.name ?? '郵局'}）</p>
          {selected.length === 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {storages.map((s) => <Chip key={s.id} on={storageId === s.id} onClick={() => onStorage(s.id)}>{s.name}</Chip>)}
            </div>
          )}
        </>
      )}
      {over && <p className="text-[#FF0055] text-sm mt-2">{over.loan.lender_name} 還款超過剩餘</p>}

      <Summary snapshot={snapshot} delta={delta} />
      <StepNav onNext={onNext} busy={busy} disabled={!!over || !storageId} />
    </div>
  );
}

function Summary({ snapshot, delta }: { snapshot: Snapshot | null; delta: number }) {
  return (
    <Card className="mt-4">
      <div className="flex justify-between items-baseline gap-3">
        <span className="text-sm text-gray-400">入帳後不凍結零用金</span>
        <Amount value={(snapshot?.main ?? 0) + delta} size="lg" />
      </div>
      <div className="flex justify-between items-baseline gap-3 mt-1">
        <span className="text-sm text-gray-400">入帳後小結</span>
        <Amount value={(snapshot?.total ?? 0) + delta} size="base" />
      </div>
      {delta !== 0 && <div className="text-xs text-gray-500 mt-1 text-right">本步 <span className="tabular-nums">{fmtAmount(delta)}</span></div>}
    </Card>
  );
}
