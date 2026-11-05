"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { recentMonths, monthLabel, type FundDonation, type FundMember } from '@/lib/fund';

type DonationRow = FundDonation & { fund_transactions: { amount: number; occurred_on: string } | null };

export default function MonthlyPage() {
  const [members, setMembers] = useState<FundMember[]>([]);
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [span, setSpan] = useState(6);

  useEffect(() => {
    (async () => {
      const [m, d] = await Promise.all([
        supabase.from('fund_members').select('*').order('sort_order'),
        supabase.from('fund_donations').select('*, fund_transactions(amount, occurred_on)'),
      ]);
      const err = m.error ?? d.error;
      if (err) setError(err.message);
      else { setMembers(m.data as FundMember[]); setDonations(d.data as DonationRow[]); }
      setLoading(false);
    })();
  }, []);

  const months = useMemo(() => recentMonths(span), [span]);

  // 每人每月金額：一筆涵蓋多個月時平均分攤，只為顯示「有繳」
  const grid = useMemo(() => {
    const g: Record<number, Record<string, number>> = {};
    for (const d of donations) {
      const amt = Number(d.fund_transactions?.amount ?? 0);
      const ms = d.months.length ? d.months : [d.fund_transactions?.occurred_on?.slice(0, 7) ?? ''];
      const share = Math.round(amt / ms.length);
      for (const m of ms) {
        g[d.member_id] ??= {};
        g[d.member_id][m] = (g[d.member_id][m] ?? 0) + share;
      }
    }
    return g;
  }, [donations]);

  const activeMembers = members.filter((m) => m.active);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="text-[#00FF41] font-mono">載入中...</div></div>;
  if (error) return <div className="flex min-h-screen items-center justify-center"><div className="text-[#FF0055] font-mono">{error}</div></div>;

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <header className="mb-6 max-w-5xl mx-auto w-full">
        <Link href="/fund" className="inline-block text-sm text-gray-500 hover:text-[#00FF41] font-mono mb-4">← 流水帳</Link>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{ textShadow: '0 0 10px rgba(0,255,65,0.3)' }}>每月繳納一覽</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">{'// MONTHLY_CHECK'}</p>
        <div className="flex gap-2 mt-4 text-sm font-mono">
          {[3, 6, 12].map((n) => (
            <button key={n} onClick={() => setSpan(n)} className={`px-3 py-1 rounded border ${span === n ? 'border-[#00FF41] text-[#00FF41]' : 'border-[#333333] text-gray-400'}`}>近 {n} 個月</button>
          ))}
        </div>
      </header>

      <main className="w-full max-w-5xl mx-auto overflow-x-auto">
        <table className="w-full text-sm font-mono border-collapse">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left p-2 border-b border-[#333333] sticky left-0 bg-black">成員</th>
              {months.map((m) => <th key={m} className="p-2 border-b border-[#333333] whitespace-nowrap">{m.slice(2, 4)}/{monthLabel(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {activeMembers.map((mem) => (
              <tr key={mem.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                <td className="p-2 border-b border-[#1a1a1a] text-white whitespace-nowrap sticky left-0 bg-black">{mem.nickname}</td>
                {months.map((m) => {
                  const v = grid[mem.id]?.[m];
                  return (
                    <td key={m} className={`p-2 border-b border-[#1a1a1a] text-center ${v ? 'text-[#00FF41]' : 'text-gray-700'}`}>
                      {v ? v.toLocaleString() : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="text-gray-400">
              <td className="p-2 border-t border-[#333333] sticky left-0 bg-black">合計</td>
              {months.map((m) => {
                const total = activeMembers.reduce((s, mem) => s + (grid[mem.id]?.[m] ?? 0), 0);
                return <td key={m} className="p-2 border-t border-[#333333] text-center">{total ? total.toLocaleString() : '·'}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </main>
    </div>
  );
}
