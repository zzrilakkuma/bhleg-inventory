"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { monthLabel, todayISO } from '@/lib/fund';
import {
  getRefs, getPeriods, getPeriodSummaries, getOpenPayables, getUnclaimedExpenses,
  type Refs, type FundPeriod, type PeriodSummary, type UnclaimedExpense,
} from '@/lib/fund-v2/api';
import { parseSettings } from '@/lib/fund-v2/settings';
import { useRole } from '@/lib/fund-v2/role';
import { duePayables, todoItems, unpaidMembers, unpaidListText, groupsMissingSummary, type PayableLike } from '@/lib/fund-v2/todo';
import { ensureMonthlyPayables, missingPayables } from '@/lib/fund-v2/autopay';
import { Card } from '../ui';
import TodoCard from './TodoCard';
import { Sparkline } from '../stats/charts';

type Payable = PayableLike & Record<string, unknown>;
interface Data {
  refs: Refs; periods: FundPeriod[]; summaries: PeriodSummary[];
  payables: Payable[]; unclaimed: UnclaimedExpense[]; donations: { member_id: number | null; months: string[] }[];
  groupSums: { group_id: number | null; title: string }[];
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
      // 小組彙整提醒用；讀不到就不提醒，不擋頁面
      const since = new Date(today); since.setDate(since.getDate() - 60);
      const sinceISO = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
      const gs = await supabase.from('fund_transactions').select('group_id, title')
        .eq('type', 'group_summary').gte('occurred_on', sinceISO);
      if (gs.error) console.warn('小組彙整讀取失敗', gs.error.message);
      if (alive) setData({ groupSums: (gs.data ?? []) as { group_id: number | null; title: string }[], refs, periods, summaries, payables: payables as Payable[], unclaimed,
        donations: (don.data ?? []) as { member_id: number | null; months: string[] }[] });
    })().catch((e) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [curMonth, today]);

  const isAccountant = role === 'accountant';

  // 會計開啟時補齊本月固定應付；每次載入頁面最多一次（ref 擋掉 effect 重複執行），失敗只記 console
  const ensured = useRef(false);
  useEffect(() => {
    if (!isAccountant || !data || ensured.current) return;
    ensured.current = true;
    (async () => {
      const [ex, exp] = await Promise.all([
        supabase.from('fund_payables').select('template_id, for_month, status')
          .or(`for_month.eq.${curMonth},and(for_month.is.null,status.eq.open,template_id.not.is.null)`),
        supabase.from('fund_expenses').select('vendor, fund_transactions!fund_expenses_transaction_id_fkey!inner(occurred_on)')
          .gte('fund_transactions.occurred_on', `${curMonth}-01`).lt('fund_transactions.occurred_on', `${nextMonth(curMonth)}-01`),
      ]);
      if (ex.error) throw ex.error;
      if (exp.error) throw exp.error;
      const vendors = new Set<string>((exp.data ?? []).map((x: { vendor: string | null }) => x.vendor).filter((v): v is string => !!v));
      const rows = missingPayables(data.refs.templates, curMonth,
        (ex.data ?? []) as { template_id: number | null; for_month: string | null; status: string }[], vendors);
      if (await ensureMonthlyPayables(supabase, rows) > 0) {
        const fresh = await getOpenPayables(supabase);
        setData((d) => (d ? { ...d, payables: fresh as Payable[] } : d));
      }
    })().catch((e) => console.warn('自動產生本月應付失敗', e));
  }, [isAccountant, data, curMonth]);
  const view = useMemo(() => {
    if (!data) return null;
    const dueDay = parseSettings(data.refs.settings).donation_due_day;
    const unpaid = unpaidMembers(data.refs.members, data.donations, today, dueDay);
    const groupDue = groupsMissingSummary(data.refs.accounts, data.groupSums, todayISO(), parseSettings(data.refs.settings).group_settle_due_day);
    return {
      items: todoItems({ payables: duePayables(data.payables, today), unclaimed: data.unclaimed, unpaid, groupDue }),
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
          {isAccountant && latest && (
            <Link href={`/fund-v2/settle/run?month=${latest.month}`}
              className="block w-full text-center rounded border border-[#333333] text-gray-300 py-2 mt-2 text-sm hover:border-[#00FF41]">
              再結一次 {Number(latest.month.slice(5, 7))} 月
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
