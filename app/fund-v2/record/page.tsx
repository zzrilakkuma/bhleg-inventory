"use client";

import { Suspense, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { getRefs, getLatestSnapshot, type Refs, type Snapshot } from '@/lib/fund-v2/api';
import { RoleGate } from '../role-gate';
import { Amount } from '../ui';
import ExpenseForm from './ExpenseForm';
import IncomeForm from './IncomeForm';
import TransferForm from './TransferForm';

type Mode = 'expense' | 'income' | 'transfer';
const MODES: { k: Mode; label: string }[] = [
  { k: 'expense', label: '支出' }, { k: 'income', label: '收入' }, { k: 'transfer', label: '轉帳' },
];

export default function RecordPage() {
  const [mode, setMode] = useState<Mode>('expense');
  const [refs, setRefs] = useState<Refs | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reloadSnap = useCallback(() => {
    getLatestSnapshot(supabase).then(setSnap).catch((e) => setErr(String(e?.message ?? e)));
  }, []);
  useEffect(() => {
    getRefs(supabase).then(setRefs).catch((e) => setErr(String(e?.message ?? e)));
    reloadSnap();
  }, [reloadSnap]);

  return (
    <RoleGate accountant>
      <div className="max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">記</h1>
          <div className="text-sm text-gray-400">零用金 <Amount value={snap?.main ?? 0} size="base" /></div>
        </div>
        <div className="flex gap-2 mb-4">
          {MODES.map((m) => (
            <button key={m.k} type="button" onClick={() => setMode(m.k)} aria-pressed={mode === m.k}
              className={`flex-1 py-2 rounded border text-sm ${mode === m.k
                ? 'border-[#00FF41] text-[#00FF41] bg-[rgba(0,255,65,0.1)]' : 'border-[#333333] text-gray-400'}`}>
              {m.label}
            </button>
          ))}
        </div>
        {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
        {!refs && !err && <p className="text-gray-500 text-sm">載入中...</p>}
        {refs && mode === 'expense' && <Suspense fallback={null}><ExpenseForm refs={refs} onSaved={reloadSnap} /></Suspense>}
        {refs && mode === 'income' && <IncomeForm refs={refs} onSaved={reloadSnap} />}
        {refs && mode === 'transfer' && <TransferForm refs={refs} snapshot={snap} onSaved={reloadSnap} />}
      </div>
    </RoleGate>
  );
}
