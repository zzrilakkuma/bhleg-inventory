"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { fetchAllTransactions, insertTransaction } from '@/lib/fund-db';
import { todayISO, fmtAmount, computeRunningBalances, buildTransferTexts, type FundAccount, type FundStorage, type FundTransaction } from '@/lib/fund';
import { Field, FundNav, PageHeader, Loading, ErrorBox, inputCls, primaryBtnCls } from '../ui';

export default function TransferPage() {
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [storages, setStorages] = useState<FundStorage[]>([]);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [fromId, setFromId] = useState<number | ''>('');
  const [toId, setToId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [ac, st, tx] = await Promise.all([
      supabase.from('fund_accounts').select('*'), supabase.from('fund_storages').select('*').eq('active', true).order('sort_order'),
      fetchAllTransactions(supabase).then((data) => ({ data, error: null }), (error: Error) => ({ data: null, error })),
    ]);
    const err = ac.error ?? st.error ?? tx.error;
    if (err) { setError(err.message); setLoading(false); return; }
    setAccounts(ac.data as FundAccount[]); setStorages(st.data as FundStorage[]); setTransactions(tx.data as FundTransaction[]);
    const post = (st.data as FundStorage[]).find((s) => s.name === '郵局'), cash = (st.data as FundStorage[]).find((s) => s.name === '現金');
    setFromId((v) => v || post?.id || ''); setToId((v) => v || cash?.id || '');
    setLoading(false);
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  const { latest } = useMemo(() => computeRunningBalances(transactions), [transactions]);
  const main = accounts.find((a) => a.kind === 'main');
  const amountNum = Math.round(Number(amount)) || 0;
  const name = (id: number | '') => storages.find((s) => s.id === id)?.name ?? '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!main) return toast.error('找不到主科目');
    if (!fromId || !toId || fromId === toId) return toast.error('請選不同的來源與目的');
    if (amountNum <= 0) return toast.error('請填金額');
    setSubmitting(true);
    try {
      const texts = buildTransferTexts({ fromName: name(fromId), toName: name(toId), amount: amountNum });
      await insertTransaction({ type: 'transfer', occurred_on: date, ...texts, amount: 0, comment: comment.trim() || null }, [
        { account_id: main.id, storage_id: fromId, amount: -amountNum },
        { account_id: main.id, storage_id: toId, amount: amountNum },
      ]);
      toast.success(`已轉帳 ${name(fromId)} → ${name(toId)} ${fmtAmount(amountNum)}`);
      setAmount(''); setComment(''); await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : '寫入失敗'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  const select = (value: number | '', onChange: (v: number | '') => void) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value) || '')} className={inputCls}>
      <option value="">— 請選擇 —</option>
      {storages.map((s) => <option key={s.id} value={s.id}>{s.name}（{fmtAmount(latest.storages[s.id] ?? 0)}）</option>)}
    </select>
  );

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <PageHeader title="轉帳" code="FUND_TRANSFER" />
      <div className="max-w-2xl mx-auto w-full -mt-4 mb-6"><FundNav current="/fund/transfer" /></div>
      <form onSubmit={submit} className="w-full max-w-md mx-auto space-y-6">
        <p className="text-sm text-gray-500 font-mono">存放位置之間搬錢，例如郵局提領到現金袋。不影響科目與總額。</p>
        <Field label="日期："><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        <Field label="從：">{select(fromId, setFromId)}</Field>
        <div className="text-center text-[#FFB000] font-mono">↓</div>
        <Field label="到：">{select(toId, setToId)}</Field>
        <Field label="金額：">
          <input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
            className={`${inputCls} text-center text-2xl font-bold`} style={{ caretColor: '#00FF41' }} />
        </Field>
        <Field label="留言（非必填）："><input value={comment} onChange={(e) => setComment(e.target.value)} className={inputCls} /></Field>
        <button type="submit" disabled={submitting} className={primaryBtnCls} style={{ boxShadow: '0 0 5px rgba(0,255,65,0.3)' }}>{submitting ? '寫入中…' : '> 轉帳'}</button>
      </form>
    </div>
  );
}
