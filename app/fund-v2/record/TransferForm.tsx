"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { insertTransaction } from '@/lib/fund-db';
import { fmtAmount } from '@/lib/fund';
import type { Refs, Snapshot } from '@/lib/fund-v2/api';
import { nextSeq } from '@/lib/fund-v2/seq';
import { afterTransfer, buildTransferWrite, slotsFrom, validateTransfer } from '@/lib/fund-v2/transfer';
import { Amount, Card, Chip, SectionLabel } from '../ui';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inputCls = 'w-full bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none';
const keyOf = (s: { accountId: number; storageId: number }) => `${s.accountId}/${s.storageId}`;

export default function TransferForm({ refs, snapshot, onSaved }: { refs: Refs; snapshot: Snapshot | null; onSaved: () => void }) {
  const slots = useMemo(() => slotsFrom(snapshot, refs), [snapshot, refs]);
  const [fromKey, setFromKey] = useState<string | null>(null);
  const [toKey, setToKey] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);

  const from = slots.find((s) => keyOf(s) === fromKey);
  const to = slots.find((s) => keyOf(s) === toKey);
  const amt = Number(amount);
  const needRef = from?.kind === 'reserve';

  // 選了相同的位置就清掉「到」
  useEffect(() => { if (fromKey && fromKey === toKey) setToKey(null); }, [fromKey, toKey]);

  const error = from && to && amt > 0 ? validateTransfer(from, to, amt, ref) : null;
  const ready = !!from && !!to && amt > 0 && !error;
  const write = ready ? buildTransferWrite(from!, to!, amt, today(), ref) : null;
  const preview = write ? afterTransfer(snapshot, write, refs) : null;
  const mainChanged = !!preview && preview.some((p) => p.label === refs.accounts.find((a) => a.kind === 'main')?.name);
  const shown = preview?.filter((p) => !(mainChanged && p.label === refs.accounts.find((a) => a.kind === 'main')?.name)) ?? [];
  const mainRow = mainChanged ? preview!.find((p) => p.label === refs.accounts.find((a) => a.kind === 'main')?.name) : null;

  const submit = async () => {
    if (!ready || busy || !from || !to) return;
    setBusy(true);
    try {
      const date = today();
      const { data, error: e } = await supabase.from('fund_transactions').select('occurred_on, seq').eq('occurred_on', date);
      if (e) throw e;
      const seq = nextSeq((data ?? []) as { occurred_on: string; seq: number }[], date);
      const w = buildTransferWrite(from, to, amt, date, ref, seq);
      await insertTransaction(w.tx, w.lines);
      toast.success('已記下');
      setFromKey(null); setToKey(null); setAmount(''); setRef('');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? '寫入失敗');
    } finally { setBusy(false); }
  };

  const chip = (s: (typeof slots)[number], on: boolean, set: (k: string) => void) => (
    <Chip key={keyOf(s)} on={on} onClick={() => set(keyOf(s))}>
      {s.label} <span className="tabular-nums text-xs opacity-70">{fmtAmount(s.balance)}</span>
    </Chip>
  );

  return (
    <div>
      <SectionLabel>從</SectionLabel>
      <div className="flex flex-wrap gap-2">{slots.map((s) => chip(s, fromKey === keyOf(s), setFromKey))}</div>

      <SectionLabel>到</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {slots.filter((s) => keyOf(s) !== fromKey).map((s) => chip(s, toKey === keyOf(s), setToKey))}
      </div>

      <SectionLabel>金額</SectionLabel>
      <input inputMode="numeric" value={amount} placeholder="0"
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
        className={`${inputCls} text-2xl py-3 tabular-nums`} />

      {needRef && (
        <>
          <SectionLabel>依據（第幾次會議）</SectionLabel>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} />
        </>
      )}

      {error && <p className="text-[#FF0055] text-sm mt-3">{error}</p>}

      {preview && (
        <Card className="mt-4">
          <div className="text-sm text-gray-400 mb-2">搬完之後</div>
          {shown.map((p) => (
            <div key={p.label} className="flex justify-between items-center py-1 text-sm">
              <span className="text-gray-300">{p.label}</span>
              <span className="tabular-nums">
                <span className="text-gray-500">{fmtAmount(p.before)} → </span><Amount value={p.after} size="base" />
              </span>
            </div>
          ))}
          {mainRow ? (
            <div className="flex justify-between items-center py-1 text-sm">
              <span className="text-gray-300">{mainRow.label}</span>
              <span className="tabular-nums">
                <span className="text-gray-500">{fmtAmount(mainRow.before)} → </span><Amount value={mainRow.after} size="base" />
              </span>
            </div>
          ) : (
            <div className="flex justify-between py-1 text-sm text-gray-500">
              <span>零用金不變</span><span className="tabular-nums">{fmtAmount(snapshot?.main ?? 0)}</span>
            </div>
          )}
        </Card>
      )}

      <button type="button" disabled={!ready || busy} onClick={submit}
        className="w-full mt-6 py-3 rounded border border-[#00FF41] text-[#00FF41] text-base disabled:opacity-40">
        {busy ? '寫入中...' : '記下'}
      </button>
    </div>
  );
}
