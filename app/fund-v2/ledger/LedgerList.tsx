"use client";

import { useMemo, useState } from 'react';
import { CATEGORIES, type FundCategory } from '@/lib/fund';
import type { LedgerRow, Refs } from '@/lib/fund-v2/api';
import { categoryOf, groupByDate, rowSummary, dateOf } from '@/lib/fund-v2/ledger';
import { Amount, Chip } from '../ui';
import RowDetail from './RowDetail';

const md = (d: string) => { const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}`; };
const ymd = (d: string) => { const [y, m, day] = d.split('-'); return `${y}/${Number(m)}/${Number(day)}`; };

export default function LedgerList({ rows, refs, isAccountant, hasEarlier, onLoadEarlier, onChanged }: {
  rows: LedgerRow[]; refs: Refs | null; isAccountant: boolean;
  hasEarlier: boolean; onLoadEarlier: () => void; onChanged: () => void;
}) {
  const [cat, setCat] = useState<FundCategory | null>(null);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (cat && categoryOf(r) !== cat) return false;
      if (needle && !(`${r.title} ${r.vendor ?? ''}`.toLowerCase().includes(needle))) return false;
      return true;
    });
    return groupByDate(filtered);
  }, [rows, cat, q]);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip on={cat === null} onClick={() => setCat(null)}>全部</Chip>
        {CATEGORIES.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋標題／店家"
          className="hidden md:block ml-auto w-56 bg-black border border-[#333333] rounded px-3 py-2 text-sm text-white" />
      </div>

      <div className="mt-3">
        {groups.length === 0 && <p className="text-gray-500 text-sm py-6 text-center">沒有符合的紀錄</p>}
        {groups.map((g) => (
          <section key={`${g.date}#${g.rows[0].id}`}>
            <div className="sticky top-0 z-10 bg-black py-1 px-1 text-xs text-gray-500 border-b border-[#222222]">{ymd(g.date)}</div>
            {g.rows.map((r) => {
              const s = rowSummary(r);
              const open = openId === r.id;
              return (
                <div key={r.id} className="border-b border-[#1a1a1a]">
                  <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : r.id)}
                    className="w-full text-left grid grid-cols-[3rem_1fr_auto_auto] md:grid-cols-[5rem_1fr_auto_auto] gap-x-3 items-baseline px-1 py-3 hover:bg-[#0f0f0f]">
                    <span className="text-xs text-gray-500 tabular-nums">{md(dateOf(r))}</span>
                    <span className="min-w-0 text-sm text-white truncate">
                      {s.title}
                      {r.off_ledger && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-400 align-middle">帳外</span>}
                    </span>
                    <span className="text-right min-w-[4.5rem]">
                      {s.amount == null
                        ? <span className="text-gray-500">—</span>
                        : r.off_ledger
                          ? <Amount value={s.amount} kind="neutral" size="sm" />
                          : s.kind === 'in'
                            ? <span className="font-mono tabular-nums text-sm text-[#00FF41]">+<Amount value={s.amount} kind="in" size="sm" /></span>
                            : <Amount value={s.kind === 'out' ? -s.amount : s.amount} kind={s.kind} size="sm" />}
                    </span>
                    <span className="text-right min-w-[3.5rem] text-gray-500"><Amount value={r.main} size="sm" kind="neutral" /></span>
                  </button>
                  {open && <RowDetail row={r} refs={refs} isAccountant={isAccountant} onChanged={onChanged} />}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {hasEarlier && (
        <button type="button" onClick={onLoadEarlier} className="mt-4 w-full py-3 text-sm text-gray-400 hover:text-white border border-[#333333] rounded">載入更早…</button>
      )}
    </div>
  );
}
