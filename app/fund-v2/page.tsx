"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import {
  getRefs, getLatestSnapshot, getPeriods, getLedgerRows,
  type Refs, type Snapshot, type FundPeriod, type LedgerRow,
} from '@/lib/fund-v2/api';
import { pageWindow } from '@/lib/fund-v2/ledger';
import { useRole } from '@/lib/fund-v2/role';
import BalanceCard from './ledger/BalanceCard';
import LedgerList from './ledger/LedgerList';

const periodLabel = (p: FundPeriod) => `${Number(p.month.split('-')[1])}月（第 ${p.period_no} 期）`;

export default function LedgerPage() {
  const role = useRole();
  const [refs, setRefs] = useState<Refs | null>(null);
  const [snap, setSnap] = useState<Snapshot | null | undefined>(undefined);
  const [periods, setPeriods] = useState<FundPeriod[] | null>(null);
  const [sel, setSel] = useState(0);
  const [more, setMore] = useState(0);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // 基礎資料與快照（寫入後重載）
  useEffect(() => {
    let alive = true;
    Promise.all([getRefs(supabase), getLatestSnapshot(supabase), getPeriods(supabase)])
      .then(([r, s, p]) => { if (alive) { setRefs(r); setSnap(s); setPeriods(p); } })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [tick]);

  const latestOrd = snap?.ord ?? 0;
  const win = useMemo(
    () => (periods && snap !== undefined ? pageWindow(periods, sel, more, latestOrd) : null),
    [periods, snap, sel, more, latestOrd],
  );

  useEffect(() => {
    if (!win || win.toOrd < win.fromOrd) { if (win) setRows([]); return; }
    let alive = true;
    getLedgerRows(supabase, win).then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [win?.fromOrd, win?.toOrd, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const hasEarlier = !!periods && sel + more < periods.length - 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">帳</h1>
        {periods && periods.length > 0 && (
          <select value={sel} onChange={(e) => { setSel(Number(e.target.value)); setMore(0); setRows([]); }}
            className="bg-black border border-[#333333] rounded px-3 py-2 text-sm text-gray-300">
            {periods.map((p, i) => <option key={p.settlement_transaction_id} value={i}>{periodLabel(p)}</option>)}
          </select>
        )}
      </div>
      {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
      {snap === undefined && !err && <p className="text-gray-500 text-sm">載入中...</p>}
      {snap && <BalanceCard snap={snap} refs={refs} />}
      {snap === null && <p className="text-gray-500 text-sm">尚無交易</p>}
      {snap !== undefined && (
        <LedgerList key={sel} rows={rows} refs={refs} isAccountant={role === 'accountant'}
          hasEarlier={hasEarlier} onLoadEarlier={() => setMore((m) => m + 1)} onChanged={reload} />
      )}
    </div>
  );
}
