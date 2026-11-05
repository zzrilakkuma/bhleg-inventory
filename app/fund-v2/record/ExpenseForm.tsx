"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { insertTransaction } from '@/lib/fund-db';
import { fmtAmount, TAG_GROUP_LABEL, type FundExpense, type FundTag, type FundTemplate } from '@/lib/fund';
import type { Refs } from '@/lib/fund-v2/api';
import { markPayablePaid } from '@/lib/fund-v2/payable';
import { nextSeq } from '@/lib/fund-v2/seq';
import { buildExpenseWrite, expenseImpact, guessTags, pendingRecurring, selectableStorages } from '@/lib/fund-v2/expense';
import { Chip, SectionLabel } from '../ui';
import { WaiveSheet, GroupSummarySheet } from './ExpenseSheets';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inputCls = 'w-full bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none';
const ADVANCE = 'advance';

type RecentExpense = FundExpense;

export default function ExpenseForm({ refs, onSaved }: { refs: Refs; onSaved: () => void }) {
  const router = useRouter();
  const urlPayableId = Number(useSearchParams().get('payable')) || null;
  const [detached, setDetached] = useState(false); // 標記失敗後脫離應付模式
  const payableId = detached ? null : urlPayableId;
  const mainAccount = refs.accounts.find((a) => a.kind === 'main') ?? refs.accounts[0];
  const advancers = refs.advancers.filter((a) => a.active);

  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [from, setFrom] = useState<number | typeof ADVANCE | null>(null); // storage id 或 先墊付
  const [advancerId, setAdvancerId] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsTouched, setTagsTouched] = useState(false);
  const [voucher, setVoucher] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState<number>(mainAccount?.id ?? 0);
  const storages = useMemo(
    () => selectableStorages(refs.storages, refs.accounts.find((a) => a.id === accountId)),
    [refs.storages, refs.accounts, accountId]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const [recent, setRecent] = useState<RecentExpense[]>([]);
  const [monthExp, setMonthExp] = useState<{ vendor: string | null; occurred_on: string }[]>([]);

  const month = date.slice(0, 7);
  const curMonth = today().slice(0, 7);

  const loadLists = useCallback(async () => {
    // 兩條 FK 指向 fund_transactions，需用 fkey 提示避免 embed 歧義
    const r = await supabase.from('fund_expenses').select('*, fund_transactions!fund_expenses_transaction_id_fkey!inner(occurred_on)')
      .order('transaction_id', { ascending: false }).limit(300);
    if (!r.error) setRecent((r.data ?? []) as RecentExpense[]);
    const [y, m] = curMonth.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    // 同上：fkey 提示
    const q = await supabase.from('fund_expenses').select('vendor, fund_transactions!fund_expenses_transaction_id_fkey!inner(occurred_on)')
      .gte('fund_transactions.occurred_on', `${curMonth}-01`).lt('fund_transactions.occurred_on', next);
    if (q.error) toast.error(`常用載入失敗：${q.error.message}`);
    else {
      setMonthExp((q.data ?? []).map((x: any) => {
        const t = Array.isArray(x.fund_transactions) ? x.fund_transactions[0] : x.fund_transactions;
        return { vendor: x.vendor, occurred_on: t.occurred_on };
      }));
    }
  }, [curMonth]);
  useEffect(() => { loadLists(); }, [loadLists]);

  const suggestions = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    for (const e of recent) if (e.vendor && !seen.has(e.vendor)) { seen.add(e.vendor); out.push(e.vendor); }
    return out;
  }, [recent]);
  const templates = useMemo(() => pendingRecurring(refs.templates, monthExp, curMonth), [refs.templates, monthExp, curMonth]);

  // ?payable=ID：以應付（與其範本）預填
  const [payErr, setPayErr] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState<number | null>(null);
  useEffect(() => {
    if (!payableId || prefilled === payableId) return;
    setPrefilled(payableId);
    (async () => {
      const { data: p, error } = await supabase.from('fund_payables').select('*').eq('id', payableId).maybeSingle();
      if (error || !p) { toast.error(error?.message ?? '找不到這筆應付'); return; }
      if (p.status !== 'open') { toast.error('這筆應付已處理'); return; }
      const t = p.template_id != null ? refs.templates.find((x) => x.id === p.template_id) : undefined;
      const v = p.vendor ?? t?.vendor ?? '';
      setVendor(v); setAmount(String(Math.round(Number(p.amount))));
      setDescription((t?.description ?? p.title ?? '').replace(/N月/g, `${Number(today().slice(5, 7))}月`));
      setTags(guessTags(v, undefined, t)); setTagsTouched(false);
    })();
  }, [payableId, prefilled, refs.templates]);

  const lastWith = useCallback((v: string) => recent.find((e) => e.vendor === v), [recent]);

  const onVendor = (v: string) => {
    setVendor(v);
    if (!tagsTouched) {
      const last = lastWith(v.trim());
      if (last) setTags(guessTags(v, last));
    }
  };

  const applyTemplate = (t: FundTemplate) => {
    const v = t.vendor ?? '';
    setVendor(v);
    setDescription((t.description ?? '').replace(/N月/g, `${Number(curMonth.split('-')[1])}月`));
    setTags(guessTags(v, lastWith(v), t)); setTagsTouched(false);
    if (t.default_amount != null) setAmount(String(t.default_amount));
    if (t.advancer_name) {
      const a = advancers.find((x) => x.name === t.advancer_name);
      if (a) { setFrom(ADVANCE); setAdvancerId(a.id); }
    } else if (t.storage_name) {
      const s = selectableStorages(refs.storages).find((x) => x.name === t.storage_name)
        ?? selectableStorages(refs.storages).find((x) => x.name.startsWith(t.storage_name!));
      if (s) { setFrom(s.id); setAdvancerId(null); }
    }
  };

  useEffect(() => {
    if (typeof from === 'number' && !storages.some((x) => x.id === from)) setFrom(null);
  }, [storages, from]);

  const amt = Number(amount);
  const storage = typeof from === 'number' ? storages.find((s) => s.id === from) : undefined;
  const advancer = from === ADVANCE ? advancers.find((a) => a.id === advancerId) : undefined;
  const ready = amt > 0 && vendor.trim() !== '' && (from === ADVANCE ? !!advancer : !!storage) && !!accountId;

  const preview = useMemo(() => {
    if (!ready) return null;
    const w = buildExpenseWrite({
      amount: amt, vendor: vendor.trim(), description: description.trim(), date, storage, advancer,
      accountId, tags, voucher: voucher.trim(), note, refs,
    });
    return expenseImpact(w, mainAccount?.id);
  }, [ready, amt, vendor, description, date, storage, advancer, accountId, tags, voucher, note, refs, mainAccount?.id]);

  const reset = () => {
    setAmount(''); setVendor(''); setDescription(''); setFrom(null); setAdvancerId(null); setTags([]);
    setTagsTouched(false); setVoucher(''); setNote(''); setDate(today()); setAccountId(mainAccount?.id ?? 0);
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from('fund_transactions').select('occurred_on, seq').eq('occurred_on', date);
      if (error) throw error;
      const seq = nextSeq((data ?? []) as { occurred_on: string; seq: number }[], date);
      const w = buildExpenseWrite({
        amount: amt, vendor: vendor.trim(), description: description.trim(), date, storage, advancer,
        accountId, tags, voucher: voucher.trim(), note, refs, seq,
      });
      const saved = await insertTransaction(w.tx, w.lines, w.sub);
      if (payableId) {
        const r = await markPayablePaid(supabase, payableId, saved.id);
        if (!r.ok) {
          setDetached(true);
          setPayErr(`已記帳（交易 #${saved.id}），但應付 #${payableId} 沒有標記為已付：${r.reason}。請到應付頁手動處理，勿重複記帳。`);
          reset(); onSaved(); loadLists();
          return;
        }
        router.replace('/fund-v2/record');
      }
      toast.success('已記下');
      reset(); onSaved(); loadLists();
    } catch (e: any) {
      toast.error(e?.message ?? '寫入失敗');
    } finally { setBusy(false); }
  };

  const toggleTag = (name: string) => {
    setTagsTouched(true);
    setTags((t) => (t.includes(name) ? t.filter((x) => x !== name) : [...t, name]));
  };
  const tagGroups = (['space', 'nature', 'item'] as FundTag['group'][]).map((g) => ({
    g, list: refs.tags.filter((t) => t.active && t.group === g),
  })).filter((x) => x.list.length);

  return (
    <div>
      {payErr && <div role="alert" className="mb-4 rounded border border-[#FF0055] p-3 text-sm text-[#FF0055]"><div>{payErr}</div>
        <button type="button" onClick={() => setPayErr(null)} className="mt-2 px-3 py-1 rounded border border-[#FF0055]">知道了</button>
      </div>}
      {templates.length > 0 && (
        <>
          <SectionLabel>常用</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Chip key={t.id} onClick={() => applyTemplate(t)}>
                {t.name}{t.default_amount != null ? ` ${fmtAmount(Number(t.default_amount))}` : ''}
              </Chip>
            ))}
          </div>
        </>
      )}

      <SectionLabel>金額</SectionLabel>
      <input inputMode="numeric" value={amount} placeholder="0"
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
        className={`${inputCls} text-2xl py-3 tabular-nums`} />

      <SectionLabel>付給誰</SectionLabel>
      <input list="fund-vendor-list" value={vendor} onChange={(e) => onVendor(e.target.value)}
        placeholder="店家或對象" className={inputCls} />
      <datalist id="fund-vendor-list">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>

      <SectionLabel>錢從哪裡出</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {storages.map((s) => <Chip key={s.id} on={from === s.id} onClick={() => { setFrom(s.id); setAdvancerId(null); }}>{s.name}</Chip>)}
        <Chip on={from === ADVANCE} onClick={() => setFrom(ADVANCE)}>先墊付</Chip>
      </div>
      {from === ADVANCE && (
        <div className="mt-2 ml-2 pl-3 border-l-2 border-[#333333]">
          <div className="text-xs text-gray-500 mb-2">誰墊的</div>
          <div className="flex flex-wrap gap-2">
            {advancers.map((a) => <Chip key={a.id} on={advancerId === a.id} onClick={() => setAdvancerId(a.id)}>{a.name}</Chip>)}
          </div>
          <div className="text-xs text-gray-500 mt-2">結算時再請款入帳</div>
        </div>
      )}

      <button type="button" onClick={() => setMore((m) => !m)} className="text-sm text-gray-500 mt-5">
        {more ? '▾' : '▸'} 更多：標籤、憑證、備註、日期、科目
      </button>
      {more && (
        <div className="mt-2">
          <SectionLabel>品項說明</SectionLabel>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          {tagGroups.map(({ g, list }) => (
            <div key={g}>
              <SectionLabel>標籤・{TAG_GROUP_LABEL[g]}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {list.map((t) => <Chip key={t.id} on={tags.includes(t.name)} onClick={() => toggleTag(t.name)}>{t.name}</Chip>)}
              </div>
            </div>
          ))}
          <SectionLabel>憑證（發票號碼等）</SectionLabel>
          <input value={voucher} onChange={(e) => setVoucher(e.target.value)} className={inputCls} />
          <SectionLabel>備註</SectionLabel>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
          <SectionLabel>日期</SectionLabel>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || today())} className={inputCls} />
          <SectionLabel>科目</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {refs.accounts.filter((a) => a.active && a.kind !== 'reserve').map((a) => (
              <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.name}</Chip>
            ))}
          </div>
          <div className="flex gap-4 mt-5 text-sm">
            <button type="button" onClick={() => setWaiveOpen(true)} className="text-gray-400 underline underline-offset-4">放棄請款</button>
            <button type="button" onClick={() => setGroupOpen(true)} className="text-gray-400 underline underline-offset-4">小組彙整</button>
          </div>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-400 min-h-5">
        {preview === null ? '' : from === ADVANCE
          ? '帳外（先墊付）：0'
          : preview === 0 ? '本筆對不凍結零用金：0' : `本筆對不凍結零用金：−${fmtAmount(Math.abs(preview))}`}
      </div>
      <button type="button" disabled={!ready || busy || !!payErr} onClick={submit}
        className="w-full mt-2 py-3 rounded border border-[#00FF41] text-[#00FF41] text-base disabled:opacity-40">
        {busy ? '寫入中...' : '記下'}
      </button>

      <WaiveSheet open={waiveOpen} onClose={() => setWaiveOpen(false)} refs={refs} onDone={() => { onSaved(); loadLists(); }} />
      <GroupSummarySheet open={groupOpen} onClose={() => setGroupOpen(false)} refs={refs} onDone={onSaved} />
    </div>
  );
}
