"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-client';
import { todayISO } from '@/lib/fund';
import {
  getPeriodSummaries, getOpenPayables, getOutstandingLoans, getAdvancesOwed, getWaivedTotal,
  type PeriodSummary, type OutstandingLoan, type AdvanceOwed,
} from '@/lib/fund-v2/api';
import { seriesFromPeriods, expenseGroups, incomeShares, salonByPeriod, rangeOptions, rangeCount, type RangeOption } from '@/lib/fund-v2/stats';
import { Amount, Card, Chip, SectionLabel } from '../ui';
import { LineChart, LineLegend, BarChart, StackedBar } from './charts';


interface Payable { id: number; title: string; amount: number; due_on: string | null; vendor: string | null }

export default function StatsPage() {
  const [range, setRange] = useState<RangeOption>('近 12 期');
  const [all, setAll] = useState<PeriodSummary[] | null>(null);
  const [loans, setLoans] = useState<OutstandingLoan[]>([]);
  const [advances, setAdvances] = useState<AdvanceOwed[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [waived, setWaived] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getPeriodSummaries(supabase, 60), getOutstandingLoans(supabase), getAdvancesOwed(supabase),
      getOpenPayables(supabase), getWaivedTotal(supabase),
    ]).then(([s, l, a, p, w]) => {
      setAll(s); setLoans(l.filter((x) => x.remaining > 0)); setAdvances(a); setPayables(p as Payable[]); setWaived(w);
    }).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const rows = useMemo(() => (all ?? []).slice(0, rangeCount(range)), [all, range]);
  const series = useMemo(() => seriesFromPeriods(rows), [rows]);
  const groups = useMemo(() => expenseGroups(rows), [rows]);
  const shares = useMemo(() => incomeShares(rows), [rows]);
  const salon = useMemo(() => salonByPeriod(rows), [rows]);
  const today = todayISO();

  if (err) return <div className="text-[#FF0055] text-sm">載入失敗：{err}</div>;
  if (!all) return <div className="text-gray-500 text-sm">載入中...</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">統計</h1>
      <div className="flex flex-wrap gap-2">
        {rangeOptions.map((r) => <Chip key={r} on={range === r} onClick={() => setRange(r)}>{r}</Chip>)}
      </div>

      <Card>
        <SectionLabel>小結 vs 零用金</SectionLabel>
        <LineChart series={series} />
        <LineLegend />
      </Card>

      <Card>
        <SectionLabel>支出（五組合計）</SectionLabel>
        <BarChart items={groups.map((g) => ({ label: g.group, value: g.amount }))} />
      </Card>

      <Card>
        <SectionLabel>收入來源</SectionLabel>
        <StackedBar shares={shares} />
      </Card>

      <Card>
        <SectionLabel>沙龍每期營收</SectionLabel>
        <BarChart items={salon.map((s) => ({ label: s.label, value: s.amount }))} />
      </Card>

      <Card>
        <SectionLabel>未償借款</SectionLabel>
        {loans.length === 0 ? <div className="text-sm text-gray-500">無</div> : (
          <ul className="space-y-1">{loans.map((l) => (
            <li key={l.loan_id} className="flex justify-between text-sm"><span className="text-gray-300">{l.lender_name}</span><Amount value={l.remaining} size="sm" /></li>
          ))}</ul>
        )}
        <SectionLabel>待還代墊</SectionLabel>
        {advances.length === 0 ? <div className="text-sm text-gray-500">無</div> : (
          <ul className="space-y-1">{advances.map((a, i) => (
            <li key={i} className="flex justify-between text-sm"><span className="text-gray-300">{a.advancer_name ?? '未指定'}</span><Amount value={a.amount} size="sm" /></li>
          ))}</ul>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionLabel>應付未付</SectionLabel>
          <Link href="/fund-v2/payables" className="text-xs text-[#00FF41] mt-4">管理 →</Link>
        </div>
        {payables.length === 0 ? <div className="text-sm text-gray-500">無</div> : (
          <ul className="space-y-1">{payables.map((p) => {
            const late = !!p.due_on && p.due_on < today;
            return (
              <li key={p.id} className="flex justify-between gap-2 text-sm">
                <span className={late ? 'text-[#FF0055]' : 'text-gray-300'}>{p.title}{p.due_on ? `（${p.due_on}${late ? ' 逾期' : ''}）` : ''}</span>
                <Amount value={p.amount} size="sm" />
              </li>
            );
          })}</ul>
        )}
      </Card>

      <Card>
        <SectionLabel>帳外支援（累計）</SectionLabel>
        <Amount value={waived} size="lg" kind="neutral" />
      </Card>
    </div>
  );
}
