"use client";

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { insertTransaction } from '@/lib/fund-db';
import { fmtAmount } from '@/lib/fund';
import { getUnclaimedExpenses, type Refs, type UnclaimedExpense } from '@/lib/fund-v2/api';
import { buildGroupSummaryWrite, waiveClaims } from '@/lib/fund-v2/expense';
import { nextSeq } from '@/lib/fund-v2/seq';
import { Sheet, Amount } from '../ui';

const inputCls = 'w-full bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none';
const btnCls = 'w-full mt-4 py-3 rounded border border-[#00FF41] text-[#00FF41] disabled:opacity-40';

export function WaiveSheet({ open, onClose, refs, onDone }: {
  open: boolean; onClose: () => void; refs: Refs; onDone: () => void;
}) {
  const [list, setList] = useState<UnclaimedExpense[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(new Set()); setList(null);
    getUnclaimedExpenses(supabase).then(setList).catch((e) => toast.error(String(e?.message ?? e)));
  }, [open]);

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const confirm = async () => {
    if (!sel.size || busy) return;
    setBusy(true);
    try {
      await waiveClaims(supabase, [...sel]);
      toast.success(`已放棄請款 ${sel.size} 筆`);
      onDone(); onClose();
    } catch (e: any) { toast.error(e?.message ?? '更新失敗'); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="放棄請款">
      <p className="text-xs text-gray-500 mb-3">勾選的代墊支出將標為「放棄請款」，不建立交易、不影響帳本。</p>
      {list === null && <p className="text-sm text-gray-500">載入中...</p>}
      {list && list.length === 0 && <p className="text-sm text-gray-500">沒有未請款的代墊</p>}
      {list?.map((e) => {
        const who = refs.advancers.find((a) => a.id === e.advancer_id)?.name;
        return (
          <label key={e.transaction_id} className="flex items-center gap-3 py-2 border-b border-[#222222]">
            <input type="checkbox" checked={sel.has(e.transaction_id)} onChange={() => toggle(e.transaction_id)} className="w-5 h-5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{e.title.split('\n')[0]}</div>
              <div className="text-xs text-gray-500">{e.stated_on ?? e.occurred_on}{who ? `・${who}` : ''}</div>
            </div>
            <Amount value={e.amount} />
          </label>
        );
      })}
      <button type="button" className={btnCls} disabled={!sel.size || busy} onClick={confirm}>
        {busy ? '更新中...' : `放棄請款（${sel.size}）`}
      </button>
    </Sheet>
  );
}

export function GroupSummarySheet({ open, onClose, refs, onDone }: {
  open: boolean; onClose: () => void; refs: Refs; onDone: () => void;
}) {
  const groups = refs.accounts.filter((a) => a.active && a.kind === 'group');
  const now = new Date();
  const [accountId, setAccountId] = useState<number>(groups[0]?.id ?? 0);
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [items, setItems] = useState<{ desc: string; amount: string }[]>([{ desc: '', amount: '' }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!accountId && groups[0]) setAccountId(groups[0].id); }, [groups, accountId]);

  const set = (i: number, p: Partial<{ desc: string; amount: string }>) =>
    setItems((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const monthOk = /^\d{4}-\d{2}$/.test(month);
  const valid = items.filter((x) => Number(x.amount) > 0);
  const total = valid.reduce((s, x) => s + Number(x.amount), 0);

  const submit = async () => {
    if (!valid.length || !accountId || busy || !monthOk) return;
    setBusy(true);
    try {
      const date = `${month}-28`;
      const { data, error } = await supabase.from('fund_transactions').select('occurred_on, seq').eq('occurred_on', date);
      if (error) throw error;
      const seq = nextSeq((data ?? []) as { occurred_on: string; seq: number }[], date);
      const w = buildGroupSummaryWrite({
        groupAccountId: accountId, month, date, seq, refs,
        items: valid.map((x) => ({ desc: x.desc.trim() || '支出', amount: Number(x.amount) })),
      });
      await insertTransaction(w.tx, w.lines);
      toast.success('已記下小組彙整');
      setItems([{ desc: '', amount: '' }]);
      onDone(); onClose();
    } catch (e: any) { toast.error(e?.message ?? '寫入失敗'); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="小組彙整">
      {groups.length === 0 ? <p className="text-sm text-gray-500">沒有小組科目</p> : (
        <>
          <div className="text-xs text-gray-500 mb-1">小組</div>
          <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))} className={inputCls}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div className="text-xs text-gray-500 mb-1 mt-3">月份</div>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
          <div className="text-xs text-gray-500 mb-1 mt-3">項目</div>
          {items.map((it, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={it.desc} placeholder="說明" onChange={(e) => set(i, { desc: e.target.value })} className={inputCls} />
              <input inputMode="numeric" value={it.amount} placeholder="金額" className={`${inputCls} w-28 tabular-nums`}
                onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d]/g, '') })} />
            </div>
          ))}
          <button type="button" className="text-sm text-gray-400" onClick={() => setItems((l) => [...l, { desc: '', amount: '' }])}>＋ 加一項</button>
          <div className="text-sm text-gray-400 mt-3">合計 −{fmtAmount(total)}</div>
          <button type="button" className={btnCls} disabled={!valid.length || busy || !monthOk} onClick={submit}>
            {busy ? '寫入中...' : '記下'}
          </button>
        </>
      )}
    </Sheet>
  );
}
