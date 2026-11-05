"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { monthLabel } from '@/lib/fund';
import {
  getRefs, getPeriods, getPeriodSummaries, getOpenPayables, getUnclaimedExpenses,
  type Refs, type FundPeriod, type PeriodSummary, type UnclaimedExpense,
} from '@/lib/fund-v2/api';
import { parseSettings } from '@/lib/fund-v2/settings';
import { useRole } from '@/lib/fund-v2/role';
import { duePayables, todoItems, unpaidMembers, unpaidListText, type PayableLike } from '@/lib/fund-v2/todo';
import { Card } from '../ui';
import TodoCard from './TodoCard';
import { Sparkline } from '../stats/charts';

type Payable = PayableLike & Record<string, unknown>;
interface Data {
  refs: Refs; periods: FundPeriod[]; summaries: PeriodSummary[];
  payables: Payable[]; unclaimed: UnclaimedExpense[]; donations: { member_id: number | null; months: string[] }[];
}

const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

export default function SettlePage() {
  const role = useRole();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [refs, periods, summaries, payables, unclaimed, don] = await Promise.all([
        getRefs(supabase), getPeriods(supabase), getPeriodSummaries(supabase, 10),
        getOpenPayables(supabase), getUnclaimedExpenses(supabase),
        supabase.from('fund_donations').select('member_id, months').contains('months', [curMonth]),
      ]);
      if (don.error) throw don.error;
      if (alive) setData({ refs, periods, summaries, payables: payables as Payable[], unclaimed,
        donations: (don.data ?? []) as { member_id: number | null; months: string[] }[] });
    })().catch((e) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [curMonth]);

  const isAccountant = role === 'accountant';
  const view = useMemo(() => {
    if (!data) return null;
    const dueDay = parseSettings(data.refs.settings).donation_due_day;
    const unpaid = unpaidMembers(data.refs.members.filter((m) => m.active), data.donations, today, dueDay);
    return {
      items: todoItems({ payables: duePayables(data.payables, today), unclaimed: data.unclaimed, unpaid }),
      copyText: unpaidListText(unpaid, curMonth),
    };
  }, [data, today, curMonth]);

  const latest = data?.periods[0];
  const startMonth = latest ? nextMonth(latest.month) : curMonth;
  const spark = data ? [...data.summaries].reverse().map((s) => s.end_total) : [];

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">算</h1>
      {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
      {!data && !err && <p className="text-gray-500 text-sm">載入中...</p>}
      {data && view && (
        <>
          <TodoCard items={view.items} isAccountant={isAccountant} copyText={view.copyText} />
          {isAccountant && (
            <Link href={`/fund-v2/settle/run?month=${startMonth}`}
              className="block w-full text-center rounded border border-[#00FF41] text-[#00FF41] bg-[rgba(0,255,65,0.1)] py-3 font-semibold">
              開始 {monthLabel(startMonth).replace('月', '')} 月結算
            </Link>
          )}
          {latest && (
            <p className="text-xs text-gray-500 mt-2 mb-4 text-center">
              上次結算 {latest.settled_on.replace(/-0?/g, '/')}
            </p>
          )}
          <Link href="/fund-v2/stats" className="block">
            <Card className="mt-2">
              <Sparkline values={spark} />
              <div className="text-xs text-gray-500 mt-2">近 10 期小結</div>
            </Card>
          </Link>
          <div className="flex justify-center gap-4 mt-6 text-sm text-gray-400">
            <Link href="/fund-v2/settings" className="py-2 px-2 hover:text-white">設定</Link>
            <span className="py-2 text-gray-600">｜</span>
            <Link href="/fund-v2/settings#members" className="py-2 px-2 hover:text-white">成員</Link>
            <span className="py-2 text-gray-600">｜</span>
            <Link href="/fund/manage" className="py-2 px-2 hover:text-white">科目</Link>
          </div>
        </>
      )}
    </div>
  );
}
