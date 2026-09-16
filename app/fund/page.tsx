"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import {
  TYPE_LABEL, computeRunningBalances, formatSnapshot, fmtAmount,
  type FundAccount, type FundStorage, type FundTransaction,
} from '@/lib/fund';

export default function FundPage() {
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [storages, setStorages] = useState<FundStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const load = async () => {
    const [tx, ac, st] = await Promise.all([
      supabase.from('fund_transactions').select('*, fund_lines(*)').order('occurred_on', { ascending: false }).order('seq', { ascending: false }).order('id', { ascending: false }),
      supabase.from('fund_accounts').select('*').order('sort_order'),
      supabase.from('fund_storages').select('*').order('sort_order'),
    ]);
    const err = tx.error ?? ac.error ?? st.error;
    if (err) setError(err.message);
    else {
      setError(null); setTransactions(tx.data as FundTransaction[]); setAccounts(ac.data as FundAccount[]); setStorages(st.data as FundStorage[]); }
    setLoading(false);
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  const { snapshots, latest } = useMemo(() => computeRunningBalances(transactions), [transactions]);
  const shown = transactions.filter((t) => typeFilter === 'all' || TYPE_LABEL[t.type] === typeFilter);
  const typeOptions = Array.from(new Set(transactions.map((t) => TYPE_LABEL[t.type])));

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="text-[#00FF41] font-mono">載入中...</div></div>;
  if (error) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-[#FF0055] font-mono mb-4">{error}</div>
      <button onClick={load} className="text-sm text-gray-500 hover:text-[#00FF41] font-mono">重新載入</button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <header className="mb-6 max-w-5xl mx-auto w-full">
        <Link href="/" className="inline-block text-sm text-gray-500 hover:text-[#00FF41] font-mono mb-4">← 返回首頁</Link>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{ textShadow: '0 0 10px rgba(0,255,65,0.3)' }}>公基金 流水帳</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">{'// FUND_LEDGER'}</p>
        <nav className="flex flex-wrap gap-3 mt-4 text-sm font-mono">
          <Link href="/fund/monthly" className="px-3 py-2 border border-[#333333] rounded text-gray-300 hover:border-[#00FF41]">每月繳納一覽</Link>
          <Link href="/fund/donate" className="px-3 py-2 border border-[#333333] rounded text-gray-300 hover:border-[#00FF41]">奉納表單（公開）</Link>
        </nav>
      </header>

      <main className="w-full max-w-5xl mx-auto space-y-6">
        <section className="p-4 border border-[#00FF41] rounded bg-gradient-to-br from-[rgba(0,255,65,0.08)] to-transparent">
          <p className="text-xs text-gray-500 font-mono mb-2">目前結算</p>
          <pre className="text-sm text-white font-mono whitespace-pre-wrap">{formatSnapshot(latest, accounts, storages)}</pre>
        </section>

        <div className="flex flex-wrap gap-2 text-sm font-mono">
          {['all', ...typeOptions].map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded border ${typeFilter === t ? 'border-[#00FF41] text-[#00FF41]' : 'border-[#333333] text-gray-400'}`}>
              {t === 'all' ? '全部' : t}
            </button>
          ))}
          <span className="ml-auto text-gray-600 self-center">{shown.length} 筆</span>
        </div>

        {shown.length === 0 ? (
          <p className="text-gray-500 font-mono text-center py-8">還沒有紀錄</p>
        ) : (
          <div className="space-y-2">
            {shown.map((t) => {
              const snap = snapshots.get(t.id);
              const isOpen = open === t.id;
              return (
                <div key={t.id} className="border border-[#333333] rounded bg-[#0a0a0a]">
                  <button onClick={() => setOpen(isOpen ? null : t.id)} className="w-full p-3 text-left hover:bg-[rgba(255,255,255,0.02)]">
                    <div className="flex items-start gap-3">
                      <span className={`text-xs font-mono px-2 py-1 rounded border shrink-0 ${t.amount >= 0 ? 'border-[#00FF41] text-[#00FF41]' : 'border-[#FF0055] text-[#FF0055]'}`}>
                        {TYPE_LABEL[t.type]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-500 font-mono">{t.occurred_on}</div>
                        <div className="text-white text-sm whitespace-pre-wrap">{t.title}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-mono font-bold ${t.amount >= 0 ? 'text-[#00FF41]' : 'text-[#FF0055]'}`}>{fmtAmount(Number(t.amount))}</div>
                        <div className="text-xs text-gray-500 font-mono">小結 {snap?.total ?? 0}</div>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 grid gap-3 sm:grid-cols-2 text-xs font-mono">
                      <div><div className="text-gray-600 mb-1">憑證</div><pre className="text-gray-300 whitespace-pre-wrap">{t.voucher || '—'}</pre></div>
                      <div><div className="text-gray-600 mb-1">備註</div><pre className="text-gray-300 whitespace-pre-wrap">{t.note || '—'}</pre></div>
                      <div>
                        <div className="text-gray-600 mb-1">明細</div>
                        {(t.fund_lines ?? []).map((l) => (
                          <div key={l.id} className="text-gray-300">
                            {accounts.find((a) => a.id === l.account_id)?.name} / {storages.find((s) => s.id === l.storage_id)?.name}：{fmtAmount(Number(l.amount))}
                          </div>
                        ))}
                      </div>
                      <div><div className="text-gray-600 mb-1">結算</div><pre className="text-gray-300 whitespace-pre-wrap">{snap ? formatSnapshot(snap, accounts, storages) : '—'}</pre></div>
                      {t.comment && <div className="sm:col-span-2"><div className="text-gray-600 mb-1">留言</div><pre className="text-gray-300 whitespace-pre-wrap">{t.comment}</pre></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
