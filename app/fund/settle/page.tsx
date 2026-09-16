"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { insertTransaction, type NewLine } from '@/lib/fund-db';
import {
  computeRunningBalances, formatSnapshot, fmtAmount, loanRemaining, recentMonths, monthLabel, todayISO, FREEZE_RATE,
  buildSettlementTexts, buildRepaymentTexts,
  type FundAccount, type FundStorage, type FundTransaction, type FundLoan, type FundRepayment, type FundSettlement,
} from '@/lib/fund';
import { Field, FundNav, PageHeader, Loading, ErrorBox, inputCls, chipCls, primaryBtnCls } from '../ui';

export default function SettlePage() {
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [storages, setStorages] = useState<FundStorage[]>([]);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [loans, setLoans] = useState<FundLoan[]>([]);
  const [repayments, setRepayments] = useState<FundRepayment[]>([]);
  const [settlements, setSettlements] = useState<FundSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(() => recentMonths(2)[0]);
  const [freezeReserve, setFreezeReserve] = useState('');
  const [freezeFuture, setFreezeFuture] = useState('');
  const [repay, setRepay] = useState<Record<number, { amount: string; fee: string }>>({});
  const [actualPost, setActualPost] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [extraNote, setExtraNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggested, setSuggested] = useState(false);

  const load = async () => {
    const [ac, st, tx, ln, rp, se] = await Promise.all([
      supabase.from('fund_accounts').select('*').order('sort_order'),
      supabase.from('fund_storages').select('*').order('sort_order'),
      supabase.from('fund_transactions').select('*, fund_lines(*)'),
      supabase.from('fund_loans').select('*').order('id'),
      supabase.from('fund_repayments').select('*'),
      supabase.from('fund_settlements').select('*'),
    ]);
    const err = ac.error ?? st.error ?? tx.error ?? ln.error ?? rp.error ?? se.error;
    if (err) { setError(err.message); setLoading(false); return; }
    setAccounts(ac.data as FundAccount[]); setStorages(st.data as FundStorage[]); setTransactions(tx.data as FundTransaction[]);
    setLoans(ln.data as FundLoan[]); setRepayments(rp.data as FundRepayment[]); setSettlements(se.data as FundSettlement[]);
    setLoading(false);
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  const { latest } = useMemo(() => computeRunningBalances(transactions), [transactions]);
  const main = accounts.find((a) => a.kind === 'main');
  const reserve = accounts.find((a) => a.name === '緊急應變備用金');
  const future = accounts.find((a) => a.name === '共存前瞻預算');
  const post = storages.find((s) => s.name === '郵局');
  const cash = storages.find((s) => s.name === '現金');
  const remaining = main ? latest.accounts[main.id] ?? 0 : 0;
  const systemPost = post ? latest.storages[post.id] ?? 0 : 0;
  const systemCash = cash ? latest.storages[cash.id] ?? 0 : 0;
  const openLoans = loans.map((l) => ({ ...l, remaining: loanRemaining(l, repayments) })).filter((l) => l.remaining > 0);
  const alreadySettled = settlements.some((s) => s.month === month);

  // 系統建議：30% / 30%，餘款不足時 0
  const suggest = () => {
    const f = remaining > 0 ? Math.floor(remaining * FREEZE_RATE) : 0;
    setFreezeReserve(String(f)); setFreezeFuture(String(f));
    setRepay(Object.fromEntries(openLoans.map((l) => [l.id, { amount: '0', fee: '0' }])));
    setSuggested(true);
  };

  const fr = Math.round(Number(freezeReserve)) || 0;
  const ff = Math.round(Number(freezeFuture)) || 0;
  const repayList = openLoans.map((l) => ({ loan: l, amount: Math.round(Number(repay[l.id]?.amount)) || 0, fee: Math.round(Number(repay[l.id]?.fee)) || 0 }));
  const repayTotal = repayList.reduce((s, r) => s + r.amount + r.fee, 0);
  const leftover = remaining - fr - ff - repayTotal;
  const diffPost = actualPost === '' ? null : Math.round(Number(actualPost)) - systemPost;
  const diffCash = actualCash === '' ? null : Math.round(Number(actualCash)) - systemCash;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!main || !reserve || !future || !post) return toast.error('科目或存放位置不完整');
    if (leftover < 0) return toast.error('凍存與還款總額超過不凍結零用金');
    if (alreadySettled && !confirm(`${monthLabel(month)} 已經結算過，要再寫一筆嗎？`)) return;
    for (const r of repayList) if (r.amount > r.loan.remaining) return toast.error(`${r.loan.lender_name} 還款超過剩餘`);
    setSubmitting(true);
    try {
      const date = todayISO();
      // 先寫還款（各自一筆），再寫結算
      const done: { lender: string; amount: number; fee: number; remaining: number }[] = [];
      for (const r of repayList) {
        if (r.amount <= 0) continue;
        const texts = buildRepaymentTexts({ lender: r.loan.lender_name, storageName: post.name, fee: r.fee });
        const lines: NewLine[] = [{ account_id: main.id, storage_id: post.id, amount: -r.amount }];
        if (r.fee) lines.push({ account_id: main.id, storage_id: post.id, amount: -r.fee, label: '手續費' });
        await insertTransaction({ type: 'repayment', occurred_on: date, seq: 1, ...texts, amount: -(r.amount + r.fee) }, lines,
          { table: 'fund_repayments', row: { loan_id: r.loan.id, amount: r.amount, fee: r.fee } });
        done.push({ lender: r.loan.lender_name, amount: r.amount, fee: r.fee, remaining: r.loan.remaining - r.amount });
      }
      const texts = buildSettlementTexts({ month, remaining, freezeReserve: fr, freezeFuture: ff, repayments: done, leftover, extraNote });
      const lines: NewLine[] = [];
      if (fr) lines.push({ account_id: main.id, storage_id: post.id, amount: -fr }, { account_id: reserve.id, storage_id: post.id, amount: fr, label: '凍存' });
      if (ff) lines.push({ account_id: main.id, storage_id: post.id, amount: -ff }, { account_id: future.id, storage_id: post.id, amount: ff, label: '凍存' });
      await insertTransaction({ type: 'settlement', occurred_on: date, seq: 2, ...texts, amount: 0, comment: null }, lines, {
        table: 'fund_settlements',
        row: { month, actual_post: actualPost === '' ? null : Math.round(Number(actualPost)), actual_cash: actualCash === '' ? null : Math.round(Number(actualCash)), system_post: systemPost, system_cash: systemCash },
      });
      toast.success(`${monthLabel(month)}結算已寫入`);
      setSuggested(false); setFreezeReserve(''); setFreezeFuture(''); setRepay({}); setActualPost(''); setActualCash(''); setExtraNote('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '寫入失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <PageHeader title="月結算" code="FUND_SETTLE" />
      <div className="max-w-2xl mx-auto w-full -mt-4 mb-6"><FundNav current="/fund/settle" /></div>

      <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6">
        <Field label="結算月份：">
          <div className="flex flex-wrap gap-2">
            {recentMonths(3).map((m) => <button type="button" key={m} onClick={() => setMonth(m)} className={chipCls(month === m)}>{m.slice(0, 4)} {monthLabel(m)}</button>)}
          </div>
          {alreadySettled && <p className="text-xs text-[#FFB000] font-mono mt-2">這個月已有結算紀錄</p>}
        </Field>

        <section className="p-4 border border-[#333333] rounded bg-[#0a0a0a]">
          <p className="text-xs text-gray-500 font-mono mb-2">結算前系統值</p>
          <pre className="text-sm text-white font-mono whitespace-pre-wrap">{formatSnapshot(latest, accounts, storages)}</pre>
        </section>

        {!suggested ? (
          <button type="button" onClick={suggest} className={primaryBtnCls}>{'> 依章程產生建議（30% / 30%）'}</button>
        ) : (
          <>
            <p className="text-sm text-gray-400 font-mono">不凍結零用金剩餘 <span className="text-white">{fmtAmount(remaining)}</span>，以下皆可改：</p>
            <Field label="凍存「緊急應變備用金」："><input type="number" inputMode="numeric" min={0} value={freezeReserve} onChange={(e) => setFreezeReserve(e.target.value)} className={inputCls} /></Field>
            <Field label="凍存「共存前瞻預算」："><input type="number" inputMode="numeric" min={0} value={freezeFuture} onChange={(e) => setFreezeFuture(e.target.value)} className={inputCls} /></Field>

            {openLoans.length > 0 && (
              <Field label="借款還款（從郵局付）：">
                <div className="space-y-3">
                  {openLoans.map((l) => (
                    <div key={l.id} className="p-3 border border-[#333333] rounded">
                      <div className="text-sm text-white mb-2">{l.lender_name}　剩餘 {fmtAmount(l.remaining)}</div>
                      <div className="flex gap-2">
                        <input type="number" inputMode="numeric" min={0} placeholder="本金" value={repay[l.id]?.amount ?? ''} onChange={(e) => setRepay((p) => ({ ...p, [l.id]: { amount: e.target.value, fee: p[l.id]?.fee ?? '0' } }))} className={inputCls} />
                        <input type="number" inputMode="numeric" min={0} placeholder="手續費" value={repay[l.id]?.fee ?? ''} onChange={(e) => setRepay((p) => ({ ...p, [l.id]: { amount: p[l.id]?.amount ?? '0', fee: e.target.value } }))} className={`${inputCls} w-28`} />
                      </div>
                    </div>
                  ))}
                </div>
              </Field>
            )}

            <p className={`text-sm font-mono ${leftover < 0 ? 'text-[#FF0055]' : 'text-gray-400'}`}>結算後不凍結零用金預留：<span className="text-white">{fmtAmount(leftover)}</span></p>

            <Field label="實際郵局餘額：" hint={diffPost === null ? `系統值 ${fmtAmount(systemPost)}` : `系統值 ${fmtAmount(systemPost)}，差額 ${fmtAmount(diffPost)}`}>
              <input type="number" inputMode="numeric" value={actualPost} onChange={(e) => setActualPost(e.target.value)} className={inputCls} />
            </Field>
            <Field label="實際現金袋餘額：" hint={diffCash === null ? `系統值 ${fmtAmount(systemCash)}` : `系統值 ${fmtAmount(systemCash)}，差額 ${fmtAmount(diffCash)}`}>
              <input type="number" inputMode="numeric" value={actualCash} onChange={(e) => setActualCash(e.target.value)} className={inputCls} />
            </Field>
            <Field label="其他備註（非必填）："><textarea rows={2} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="因資金不足 未支付9月【中央蘭室專款】" className={`${inputCls} text-sm resize-none`} /></Field>

            <button type="submit" disabled={submitting} className={primaryBtnCls} style={{ boxShadow: '0 0 5px rgba(0,255,65,0.3)' }}>
              {submitting ? '寫入中…' : `> 確認 ${monthLabel(month)}結算`}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
