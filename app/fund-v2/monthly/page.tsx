"use client";

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { recentMonths, todayISO, fmtAmount } from '@/lib/fund';
import { getRefs, getDonationsForMonths } from '@/lib/fund-v2/api';
import { donationGrid, type DonationRow, type Cell } from '@/lib/fund-v2/membership';
import { parseSettings } from '@/lib/fund-v2/settings';
import type { FundMember } from '@/lib/fund';
import { Card, Chip } from '../ui';

const SPANS = [6, 12] as const;

const CellView = ({ c }: { c: Cell }) => {
  if (c.state === 'paid') return <span className="font-mono tabular-nums text-white">{fmtAmount(c.amount)}</span>;
  if (c.state === 'covered') return <span aria-label="已含在另一筆奉納" className="text-[#00FF41]">✓</span>;
  if (c.state === 'unpaid') return <span role="img" aria-label="未繳" className="inline-block w-2 h-2 rounded-full bg-[#FF0055]" />;
  return <span className="text-gray-600">·</span>;
};

export default function MonthlyPage() {
  const [span, setSpan] = useState<(typeof SPANS)[number]>(6);
  const [members, setMembers] = useState<FundMember[] | null>(null);
  const [dueDay, setDueDay] = useState(14);
  const [rows, setRows] = useState<DonationRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const months = useMemo(() => recentMonths(span), [span]);

  useEffect(() => {
    getRefs(supabase).then((r) => { setMembers(r.members); setDueDay(parseSettings(r.settings).donation_due_day); })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);
  useEffect(() => {
    setRows(null);
    getDonationsForMonths(supabase, months).then(setRows).catch((e) => setErr(String(e?.message ?? e)));
  }, [months]);

  const grid = useMemo(
    () => (members && rows ? donationGrid(members, months, rows, todayISO(), dueDay) : []),
    [members, rows, months, dueDay],
  );
  const totals = useMemo(() => months.map((_, i) => grid.reduce((s, r) => {
    const c = r.cells[i];
    return c.state === 'paid' ? s + c.amount : s;
  }, 0)), [grid, months]);

  if (err) return <div role="alert" className="text-[#FF0055] text-sm">載入失敗：{err}</div>;
  if (!members || !rows) return <div className="text-gray-500 text-sm">載入中...</div>;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">每月奉納一覽</h1>
      <div className="flex flex-wrap gap-2">
        {SPANS.map((n) => <Chip key={n} on={span === n} onClick={() => setSpan(n)}>{n} 個月</Chip>)}
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-gray-500">
                <th scope="col" className="sticky left-0 z-10 bg-[#0a0a0a] text-left font-normal px-3 py-2">成員</th>
                {months.map((m) => <th key={m} scope="col" className="font-normal px-3 py-2 whitespace-nowrap text-right">{m.slice(2).replace('-', '/')}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.map(({ member, cells }) => (
                <tr key={member.id} className="border-t border-[#222222]">
                  <th scope="row" className="sticky left-0 z-10 bg-[#0a0a0a] text-left font-normal px-3 py-2 whitespace-nowrap text-gray-300">{member.nickname}</th>
                  {cells.map((c, i) => <td key={months[i]} className="px-3 py-2 text-right whitespace-nowrap"><CellView c={c} /></td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#333333]">
                <th scope="row" className="sticky left-0 z-10 bg-[#0a0a0a] text-left font-normal px-3 py-2 text-gray-400">合計</th>
                {totals.map((t, i) => <td key={months[i]} className="px-3 py-2 text-right whitespace-nowrap font-mono tabular-nums text-[#00FF41]">{fmtAmount(t)}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-xs text-gray-500">✓ 已含在另一筆奉納（一次繳多個月時，金額記在收款那個月）</p>
    </div>
  );
}
