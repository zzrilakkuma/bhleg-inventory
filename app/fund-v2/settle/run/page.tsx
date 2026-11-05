"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { deleteTransaction, insertTransaction } from '@/lib/fund-db';
import { monthLabel } from '@/lib/fund';
import { parseSettings } from '@/lib/fund-v2/settings';
import {
  getRefs, getLatestSnapshot, getPeriods, getUnclaimedExpenses, getOutstandingLoans,
  type Refs, type Snapshot, type UnclaimedExpense, type OutstandingLoan,
} from '@/lib/fund-v2/api';
import { nextSeq } from '@/lib/fund-v2/seq';
import {
  applyLines, buildClaimWrites, buildRepaymentWrites, buildSettlementWrite, computeFreeze, lateDays,
  nextPeriod, publishText, settlementLines, DEFAULT_ZERO_REASON,
} from '@/lib/fund-v2/settlement';
import { RoleGate } from '../../role-gate';
import ClaimStep, { type RepayDraft } from './steps/ClaimStep';
import FreezeStep from './steps/FreezeStep';
import ReconcileStep from './steps/ReconcileStep';
import PublishStep from './steps/PublishStep';
import type { Step1Written } from './shared';

const STEPS = ['請款', '凍存', '核對', '公布'];
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

const seqFor = async (date: string) => {
  const { data, error } = await supabase.from('fund_transactions').select('occurred_on, seq').eq('occurred_on', date);
  if (error) throw error;
  return nextSeq((data ?? []) as { occurred_on: string; seq: number }[], date);
};

export default function SettleRunPage() {
  return (
    <RoleGate accountant>
      <Suspense fallback={<p className="text-gray-500 text-sm">載入中...</p>}>
        <Wizard />
      </Suspense>
    </RoleGate>
  );
}

function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const qMonth = params.get('month') ?? '';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(qMonth) ? qMonth : todayISO().slice(0, 7);

  const [refs, setRefs] = useState<Refs | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [unclaimed, setUnclaimed] = useState<UnclaimedExpense[]>([]);
  const [loans, setLoans] = useState<OutstandingLoan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(todayISO());
  const [editDate, setEditDate] = useState(false);
  const [busy, setBusy] = useState(false);

  // 第 1 步
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [storageId, setStorageId] = useState<number | null>(null);
  const [repay, setRepay] = useState<RepayDraft>({});
  const [written, setWritten] = useState<Step1Written | null>(null);
  // 第 2 步：null = 照設定
  const [freezeEdit, setFreezeEdit] = useState<{ reserve: string; future: string } | null>(null);
  const [zeroReason, setZeroReason] = useState(DEFAULT_ZERO_REASON);
  // 第 3 步
  const [actual, setActual] = useState<{ post: string; cash: string } | null>(null);

  const load = useCallback(async () => {
    const [r, s, u, l] = await Promise.all([
      getRefs(supabase), getLatestSnapshot(supabase), getUnclaimedExpenses(supabase), getOutstandingLoans(supabase),
    ]);
    setRefs(r); setSnap(s); setUnclaimed(u);
    setLoans(l.filter((x) => x.status === 'open' && x.remaining > 0));
    return { r, u };
  }, []);

  useEffect(() => {
    load().then(({ r, u }) => {
      setChecked(new Set(u.map((e) => e.transaction_id)));
      setStorageId(r.storages.find((s) => s.name === '郵局')?.id ?? null);
    }).catch((e) => setErr(String(e?.message ?? e)));
  }, [load]);

  const storages = useMemo(
    () => (refs?.storages ?? []).filter((s) => s.active && (s.name === '郵局' || s.name === '現金')), [refs]);
  const post = storages.find((s) => s.name === '郵局');
  const cash = storages.find((s) => s.name === '現金');
  const settings = useMemo(() => parseSettings(refs?.settings ?? {}), [refs]);
  const dueDay = settings.settlement_due_day;
  const rate = settings.freeze_rate;
  const late = lateDays(month, date, dueDay);

  const charter = useMemo(() => computeFreeze(snap?.main ?? 0, settings, snap?.total), [snap, settings]);
  const freeze = freezeEdit
    ? { base: charter.base, reserve: Number(freezeEdit.reserve) || 0, future: Number(freezeEdit.future) || 0 }
    : charter;
  const system = { post: post ? snap?.storages[post.id] ?? 0 : 0, cash: cash ? snap?.storages[cash.id] ?? 0 : 0 };
  const act = actual ?? { post: String(system.post), cash: String(system.cash) };
  const actualN = { post: Number(act.post) || 0, cash: Number(act.cash) || 0 };

  const previewResult = useMemo((): { snap: Snapshot } | { error: string } | null => {
    if (!refs || !snap) return null;
    try { return { snap: applyLines(snap, settlementLines({ freeze, system, actual: actualN, refs }), refs) }; }
    catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs, snap, freeze.reserve, freeze.future, system.post, system.cash, actualN.post, actualN.cash]);
  const preview = previewResult && 'snap' in previewResult ? previewResult.snap : null;
  const previewError = previewResult && 'error' in previewResult ? previewResult.error : null;

  // 結算日不得早於帳上最後一筆交易，避免插在帳本中間
  const minDate = snap?.occurred_on ?? '';
  const dateTooEarly = !!minDate && date < minDate;
  const earlyMsg = `結算日不能早於最後一筆交易（${minDate ? md(minDate) : ''}）`;

  // ---- 第 1 步寫入 ----
  const submitStep1 = async () => {
    if (!refs) return;
    if (written) { setStep(2); return; }
    const st = storages.find((s) => s.id === storageId);
    if (!st) { toast.error('請選存放位置'); return; }
    const selected = unclaimed.filter((e) => checked.has(e.transaction_id));
    const repayInput = loans.map((l) => ({ loan: l, amount: Number(repay[l.loan_id]?.amount) || 0, fee: Number(repay[l.loan_id]?.fee) || 0 }));
    if (repayInput.some((r) => r.amount > r.loan.remaining)) { toast.error('還款超過剩餘'); return; }
    if (!selected.length && !repayInput.some((r) => r.amount > 0)) { setStep(2); return; }
    if (dateTooEarly) { toast.error(earlyMsg); return; }

    setBusy(true);
    const done: Step1Written = { claim: null, repayments: [] };
    let ok = false;
    try {
      let seq = await seqFor(date);
      const claim = buildClaimWrites(selected, date, st, refs, seq);
      if (claim) {
        const { id } = await insertTransaction(claim.tx, claim.lines);
        const up = await supabase.from('fund_expenses')
          .update({ claim_status: 'claimed', claimed_transaction_id: id, claimed_on: date })
          .in('transaction_id', claim.claimedExpenseIds).eq('claim_status', 'unclaimed')
          .select('transaction_id');
        if (up.error || (up.data ?? []).length !== claim.claimedExpenseIds.length) {
          await deleteTransaction(id);
          throw new Error(`代墊狀態更新失敗：${up.error?.message ?? '筆數不符'}`);
        }
        done.claim = { id, count: claim.claimedExpenseIds.length, sum: claim.tx.amount };
        seq += 1;
      }
      for (const w of buildRepaymentWrites(repayInput, date, st, refs, seq)) {
        const { id } = await insertTransaction(w.tx, w.lines, w.sub);
        // 剩餘 = 本金 − 已還（含本次），即 loanRemaining
        done.repayments.push({ id, lender: w.loan.lender_name, amount: w.amount, fee: w.fee, remaining: w.loan.principal - w.loan.repaid - w.amount });
      }
      toast.success('已入帳');
      ok = true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '寫入失敗');
    }
    const wroteSome = !!done.claim || done.repayments.length > 0;
    if (wroteSome) {
      setWritten(done);
      setEditDate(false);
      try { await load(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      setFreezeEdit(null); setActual(null);
      // 部分失敗時留在第 1 步，讓會計看到哪些已入帳
      if (ok) setStep(2);
    }
    setBusy(false);
  };

  // ---- 第 4 步：完成結算 ----
  const finish = async () => {
    if (!refs || !snap) return;
    if (dateTooEarly) { toast.error(earlyMsg); return; }
    setBusy(true);
    try {
      const [seq, periods] = await Promise.all([seqFor(date), getPeriods(supabase)]);
      const w = buildSettlementWrite({
        month, periodNo: nextPeriod(periods, month), date, seq, freeze,
        zeroReason: freeze.reserve === 0 && freeze.future === 0 ? zeroReason : undefined,
        mainBefore: snap.main, system, actual: actualN,
        repayments: (written?.repayments ?? []).map((r) => ({ lender: r.lender, amount: r.amount, fee: r.fee, remaining: r.remaining })),
        refs, settings,
      });
      await insertTransaction(w.tx, w.lines, w.sub);
      toast.success(`${monthLabel(month)}結算已完成`);
      router.push('/fund-v2');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '寫入失敗');
      setBusy(false);
    }
  };

  const text = preview && refs ? publishText(preview, refs, month, date) : '';

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold">{Number(month.slice(5))} 月結算</h1>
      <div className="text-sm text-gray-400 mt-1 flex flex-wrap items-center gap-x-1">
        <span>結算日</span>
        {editDate && !written ? (
          <input type="date" value={date} autoFocus min={minDate || undefined}
            onChange={(e) => setDate(e.target.value || todayISO())} onBlur={() => setEditDate(false)}
            className="bg-black border border-[#333333] rounded px-2 py-1 text-white text-sm" />
        ) : (
          <button type="button" disabled={!!written} onClick={() => setEditDate(true)}
            className={`tabular-nums text-white ${written ? '' : 'underline decoration-dotted underline-offset-4'}`}>
            {md(date)}
          </button>
        )}
        <span>（章程 {dueDay} 日{late > 0 ? `，延後 ${late} 天` : ''}）</span>
      </div>
      {dateTooEarly && <p role="alert" className="text-[#FF0055] text-xs mt-1">{earlyMsg}</p>}

      <div className="mt-4 mb-5" role="group" aria-label="結算步驟">
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded ${i < step ? 'bg-[#00FF41]' : 'bg-[#222222]'}`} />
          ))}
        </div>
        <div className="flex gap-1 mt-1 text-xs">
          {STEPS.map((s, i) => (
            <div key={s} aria-current={i + 1 === step ? "step" : undefined} className={`flex-1 ${i + 1 === step ? 'text-[#00FF41]' : 'text-gray-500'}`}>{i + 1} {s}</div>
          ))}
        </div>
      </div>

      {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
      {!refs && !err && <p className="text-gray-500 text-sm">載入中...</p>}

      {refs && step === 1 && (
        <ClaimStep snapshot={snap} unclaimed={unclaimed} loans={loans} checked={checked}
          onToggle={(id) => setChecked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
          storages={storages} storageId={storageId} onStorage={setStorageId}
          repay={repay} onRepay={(id, f, v) => setRepay((r) => ({ ...r, [id]: { amount: r[id]?.amount ?? '', fee: r[id]?.fee ?? '', [f]: v } }))}
          written={written} busy={busy} onNext={submitStep1} />
      )}
      {refs && step === 2 && (
        <FreezeStep main={snap?.main ?? 0} total={snap?.total ?? 0} rate={rate} charter={charter}
          reserve={freezeEdit?.reserve ?? String(charter.reserve)} future={freezeEdit?.future ?? String(charter.future)}
          isCharter={freezeEdit === null}
          onCharter={() => setFreezeEdit(null)} onNone={() => setFreezeEdit({ reserve: '0', future: '0' })}
          onReserve={(v) => setFreezeEdit((f) => ({ reserve: v, future: f?.future ?? String(charter.future) }))}
          onFuture={(v) => setFreezeEdit((f) => ({ reserve: f?.reserve ?? String(charter.reserve), future: v }))}
          zeroReason={zeroReason} onZeroReason={setZeroReason}
          onBack={() => setStep(1)} onNext={() => setStep(3)} />
      )}
      {refs && step === 3 && previewError && (
        <div>
          <p role="alert" className="text-[#FF0055] text-sm">無法產生預覽：{previewError}</p>
          <button type="button" onClick={() => setStep(2)}
            className="w-full sm:w-auto mt-4 px-6 py-3 rounded border border-[#333333] text-gray-300">上一步</button>
        </div>
      )}
      {refs && step === 3 && preview && (
        <ReconcileStep systemPost={system.post} systemCash={system.cash} actualPost={act.post} actualCash={act.cash}
          onPost={(v) => setActual({ ...act, post: v })} onCash={(v) => setActual({ ...act, cash: v })}
          preview={preview} accounts={refs.accounts} storages={refs.storages}
          onBack={() => setStep(2)} onNext={() => setStep(4)} />
      )}
      {refs && step === 4 && (
        <PublishStep text={text} busy={busy} onBack={() => setStep(3)} onFinish={finish} />
      )}
    </div>
  );
}
