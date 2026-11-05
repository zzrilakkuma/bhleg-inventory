"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { insertTransaction } from '@/lib/fund-db';
import {
  fmtAmount, INCOME_SOURCE_LABEL, memberDisplayName, recentMonths,
  monthLabel, type IncomeSource,
} from '@/lib/fund';
import type { Refs } from '@/lib/fund-v2/api';
import { parseSettings } from '@/lib/fund-v2/settings';
import { nextSeq } from '@/lib/fund-v2/seq';
import { selectableStorages } from '@/lib/fund-v2/expense';
import { allocationLines, buildIncomeWrite, monthlyCapWarning } from '@/lib/fund-v2/income';
import { Chip, SectionLabel } from '../ui';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inputCls = 'w-full bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none';
const SOURCES: IncomeSource[] = ['donation', 'salon', 'event', 'kitchen', 'reinject', 'loan', 'other'];
const SOURCE_CHIP: Partial<Record<IncomeSource, string>> = { reinject: '回注' };

export default function IncomeForm({ refs, onSaved }: { refs: Refs; onSaved: () => void }) {
  const mainAccount = refs.accounts.find((a) => a.kind === 'main');
  const members = useMemo(() => refs.members.filter((m) => m.active), [refs.members]);
  const handlers = useMemo(() => refs.handlers.filter((h) => h.active), [refs.handlers]);
  const specials = useMemo(
    () => refs.accounts.filter((a) => a.active && (a.kind === 'group' || a.kind === 'special')), [refs.accounts]);
  const storages = useMemo(() => selectableStorages(refs.storages, mainAccount), [refs.storages, mainAccount]);
  const post = storages.find((s) => s.name === '郵局');
  const cashSt = storages.find((s) => s.name === '現金');
  const { monthly_cap: cap, standard_amount: standardAmount } = useMemo(() => parseSettings(refs.settings), [refs.settings]);
  const curMonth = today().slice(0, 7);
  const monthOptions = useMemo(() => recentMonths(3), []);

  const [source, setSource] = useState<IncomeSource>('donation');
  const [memberId, setMemberId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [amtTouched, setAmtTouched] = useState(false);
  const [method, setMethod] = useState<'transfer' | 'cash'>('transfer');
  const [last5, setLast5] = useState('');
  const [handlerId, setHandlerId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [storageId, setStorageId] = useState<number | null>(null);
  const [alloc, setAlloc] = useState<Record<number, string>>({});
  const [allocOpen, setAllocOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [months, setMonths] = useState<string[]>([curMonth]);
  const [payerId, setPayerId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<{ member_id: number; months: string[]; amount: number }[]>([]);

  const isDonation = source === 'donation';
  const member = members.find((m) => m.id === memberId);
  const payer = members.find((m) => m.id === payerId);
  const handler = handlers.find((h) => h.id === handlerId);
  const amt = Number(amount);

  const onMember = (id: number | null) => {
    setMemberId(id);
    const m = members.find((x) => x.id === id);
    setLast5(m?.default_last5 ?? '');
  };

  // 奉納的存放由收法決定；其他來源自選
  const storage = isDonation && member
    ? (method === 'transfer' ? post : cashSt)
    : storages.find((s) => s.id === storageId);

  // 該成員既有奉納（依涵蓋月份）用於上限提醒
  const loadExisting = useCallback(async () => {
    if (!memberId) { setExisting([]); return; }
    const q = await supabase.from('fund_donations').select('member_id, months, fund_transactions!inner(amount)')
      .eq('member_id', memberId);
    if (q.error) { toast.error(`累計載入失敗：${q.error.message}`); return; }
    setExisting((q.data ?? []).map((x: any) => {
      const t = Array.isArray(x.fund_transactions) ? x.fund_transactions[0] : x.fund_transactions;
      return { member_id: x.member_id, months: x.months ?? [], amount: Number(t.amount) };
    }));
  }, [memberId]);
  useEffect(() => { loadExisting(); }, [loadExisting]);

  const warning = isDonation && member && amt > 0 ? monthlyCapWarning(member, months, existing, amt, cap) : null;

  const allocations = useMemo(
    () => specials.map((a) => ({ accountId: a.id, amount: Number(alloc[a.id]) || 0 })).filter((a) => a.amount > 0),
    [specials, alloc]);
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  const remainder = amt - allocated;

  const sourceOk = isDonation ? !!member && months.length > 0 && (method === 'transfer' || !!handler)
    : source === 'loan' ? (!!member || description.trim() !== '') : true;
  const ready = amt > 0 && sourceOk && !!storage && remainder >= 0;

  const reset = () => {
    setAmount(''); setAmtTouched(false); setMemberId(null); setLast5(''); setHandlerId(null); setDescription(''); setAlloc({});
    setMonths([curMonth]); setPayerId(null); setMessage(''); setDate(today()); setStorageId(null);
  };

  const submit = async () => {
    if (!ready || busy || !storage) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('fund_transactions').select('occurred_on, seq').eq('occurred_on', date);
      if (error) throw error;
      const seq = nextSeq((data ?? []) as { occurred_on: string; seq: number }[], date);
      const w = buildIncomeWrite({
        source, amount: amt, date, member: (isDonation || source === 'loan') ? member : undefined, payer: isDonation ? payer : undefined,
        method, last5: last5.trim(), handler, storage, allocations, months: isDonation ? months : [],
        message, description: description.trim(), refs, seq,
      });
      await insertTransaction(w.tx, w.lines, w.sub);
      toast.success('已記下');
      reset(); onSaved(); loadExisting();
    } catch (e: any) {
      toast.error(e?.message ?? '寫入失敗');
    } finally { setBusy(false); }
  };

  const toggleMonth = (m: string) =>
    setMonths((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort()));

  const impact = ready ? allocationLines(amt, allocations, storage!, refs).remainder : null;

  return (
    <div>
      <SectionLabel>這是什麼錢</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <Chip key={s} on={source === s} onClick={() => setSource(s)}>{SOURCE_CHIP[s] ?? INCOME_SOURCE_LABEL[s]}</Chip>
        ))}
      </div>

      {(isDonation || source === 'loan') && (
        <>
          <SectionLabel>{isDonation ? '誰' : '誰借的（成員，或在說明填名字）'}</SectionLabel>
          <select value={memberId ?? ''} onChange={(e) => onMember(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
            <option value="">選擇成員</option>
            {members.map((m) => <option key={m.id} value={m.id}>{memberDisplayName(m)}</option>)}
          </select>
        </>
      )}

      <SectionLabel>金額</SectionLabel>
      <input inputMode="numeric" value={amount} placeholder="0" onBlur={() => setAmtTouched(true)}
        aria-invalid={amtTouched && !(Number(amount) > 0)}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
        className={`${inputCls} text-2xl py-3 tabular-nums`} />
      {isDonation && (
        <div className="flex gap-2 mt-2">
          <Chip on={amt === standardAmount} onClick={() => setAmount(String(standardAmount))}>{fmtAmount(standardAmount)}</Chip>
        </div>
      )}
      {isDonation && months.length === 0 && <p className="text-yellow-400 text-sm mt-2">請選至少一個月</p>}
      {warning && <p className="text-yellow-400 text-sm mt-2">{warning}</p>}

      {isDonation ? (
        <>
          <SectionLabel>怎麼收</SectionLabel>
          <div className="flex gap-2">
            <Chip on={method === 'transfer'} onClick={() => setMethod('transfer')}>匯款</Chip>
            <Chip on={method === 'cash'} onClick={() => setMethod('cash')}>現金</Chip>
          </div>
          {method === 'transfer' ? (
            <div className="mt-2 ml-2 pl-3 border-l-2 border-[#333333]">
              <div className="text-xs text-gray-500 mb-2">匯款帳號末五碼</div>
              <input inputMode="numeric" maxLength={5} value={last5}
                onChange={(e) => setLast5(e.target.value.replace(/[^\d]/g, ''))} className={inputCls} />
            </div>
          ) : (
            <div className="mt-2 ml-2 pl-3 border-l-2 border-[#333333]">
              <div className="text-xs text-gray-500 mb-2">經手人</div>
              <div className="flex flex-wrap gap-2">
                {handlers.map((h) => <Chip key={h.id} on={handlerId === h.id} onClick={() => setHandlerId(h.id)}>{h.name}</Chip>)}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <SectionLabel>說明</SectionLabel>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          <SectionLabel>存放</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {storages.map((s) => <Chip key={s.id} on={storageId === s.id} onClick={() => setStorageId(s.id)}>{s.name}</Chip>)}
          </div>
        </>
      )}

      {specials.length > 0 && (
        <>
          <button type="button" onClick={() => setAllocOpen((o) => !o)} className="text-sm text-gray-500 mt-5 block">
            {allocOpen ? '▾' : '▸'} 指定專款
          </button>
          {allocOpen && (
            <div className="mt-2">
              {specials.map((a) => (
                <div key={a.id} className="flex items-center gap-3 mb-2">
                  <span className="w-24 text-sm text-gray-300 shrink-0">{a.name}</span>
                  <input inputMode="numeric" value={alloc[a.id] ?? ''} placeholder="0"
                    onChange={(e) => setAlloc((s) => ({ ...s, [a.id]: e.target.value.replace(/[^\d]/g, '') }))}
                    className={`${inputCls} tabular-nums`} />
                </div>
              ))}
              <div className={`text-sm ${remainder < 0 ? 'text-[#FF0055]' : 'text-gray-400'}`}>
                {remainder < 0 ? `專款超過收入 ${fmtAmount(-remainder)}` : `其餘 ${fmtAmount(remainder)} → 不凍結零用金`}
              </div>
            </div>
          )}
        </>
      )}

      <button type="button" onClick={() => setMore((m) => !m)} className="text-sm text-gray-500 mt-5 block">
        {more ? '▾' : '▸'} 更多：{isDonation ? '哪幾個月、代繳、' : ''}留言、日期
      </button>
      {more && (
        <div className="mt-2">
          {isDonation && (
            <>
              <SectionLabel>哪幾個月</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {monthOptions.map((m) => <Chip key={m} on={months.includes(m)} onClick={() => toggleMonth(m)}>{monthLabel(m)}</Chip>)}
              </div>
              <SectionLabel>代繳（誰幫忙繳的）</SectionLabel>
              <select value={payerId ?? ''} onChange={(e) => setPayerId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                <option value="">無</option>
                {members.map((m) => <option key={m.id} value={m.id}>{memberDisplayName(m)}</option>)}
              </select>
            </>
          )}
          <SectionLabel>留言</SectionLabel>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={inputCls} />
          <SectionLabel>日期</SectionLabel>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} className={inputCls} />
        </div>
      )}

      <div className="mt-6 text-sm text-gray-400 min-h-5">
        {impact === null ? '' : `本筆對不凍結零用金：+${fmtAmount(impact)}`}
      </div>
      <button type="button" disabled={!ready || busy} onClick={submit}
        className="w-full mt-2 py-3 rounded border border-[#00FF41] text-[#00FF41] text-base disabled:opacity-40">
        {busy ? '寫入中...' : '記下'}
      </button>
    </div>
  );
}
