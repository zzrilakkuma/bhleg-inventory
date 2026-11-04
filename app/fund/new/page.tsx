"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { fetchAllTransactions, insertTransaction, type NewLine } from '@/lib/fund-db';
import {
  todayISO, fmtAmount, computeRunningBalances, loanRemaining, TAG_GROUP_LABEL,
  buildExpenseTexts, buildAdvanceSettleTexts, buildLoanTexts, buildRepaymentTexts, buildTransferTexts, buildOtherIncomeTexts,
  type FundAccount, type FundStorage, type FundAdvancer, type FundTag, type FundLoan, type FundRepayment, type FundTransaction, type FundTemplate, type FundExpense,
} from '@/lib/fund';
import { Field, FundNav, PageHeader, Loading, ErrorBox, inputCls, chipCls, primaryBtnCls } from '../ui';

type Kind = 'expense' | 'advance_settle' | 'loan' | 'repayment' | 'transfer' | 'income' | 'refund';
const KINDS: [Kind, string][] = [
  ['expense', '支出'], ['transfer', '轉帳'], ['advance_settle', '清償代墊'], ['loan', '借款'], ['repayment', '還款'], ['refund', '回注'], ['income', '其他收入'],
];

export default function NewTransactionPage() {
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [storages, setStorages] = useState<FundStorage[]>([]);
  const [advancers, setAdvancers] = useState<FundAdvancer[]>([]);
  const [tags, setTags] = useState<FundTag[]>([]);
  const [loans, setLoans] = useState<FundLoan[]>([]);
  const [repayments, setRepayments] = useState<FundRepayment[]>([]);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [templates, setTemplates] = useState<FundTemplate[]>([]);
  const [lastSame, setLastSame] = useState<FundExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>('expense');
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  // 支出
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [storageId, setStorageId] = useState<number | ''>('');
  const [selTags, setSelTags] = useState<string[]>([]);
  const [advancerId, setAdvancerId] = useState<number | ''>('');
  // 轉帳
  const [fromId, setFromId] = useState<number | ''>('');
  const [toId, setToId] = useState<number | ''>('');
  // 借款／還款
  const [lender, setLender] = useState('');
  const [loanId, setLoanId] = useState<number | ''>('');
  const [fee, setFee] = useState('');
  // 回注／其他收入
  const [source, setSource] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [ac, st, ad, tg, ln, rp, tx, tp] = await Promise.all([
        supabase.from('fund_accounts').select('*').order('sort_order'),
        supabase.from('fund_storages').select('*').order('sort_order'),
        supabase.from('fund_advancers').select('*').eq('active', true).order('sort_order'),
        supabase.from('fund_tags').select('*').eq('active', true).order('sort_order'),
        supabase.from('fund_loans').select('*').order('id'),
        supabase.from('fund_repayments').select('*'),
        fetchAllTransactions(supabase).then((data) => ({ data, error: null }), (error: Error) => ({ data: null, error })),
        supabase.from('fund_templates').select('*').eq('active', true).order('sort_order'),
      ]);
      const err = ac.error ?? st.error ?? ad.error ?? tg.error ?? ln.error ?? rp.error ?? tx.error;
      if (!tp.error) setTemplates(tp.data as FundTemplate[]);
      if (err) { setError(err.message); setLoading(false); return; }
      setAccounts(ac.data as FundAccount[]); setStorages(st.data as FundStorage[]); setAdvancers(ad.data as FundAdvancer[]);
      setTags(tg.data as FundTag[]); setLoans(ln.data as FundLoan[]); setRepayments(rp.data as FundRepayment[]);
      setTransactions(tx.data as FundTransaction[]);
      const main = (ac.data as FundAccount[]).find((a) => a.kind === 'main');
      const cash = (st.data as FundStorage[]).find((s) => s.name === '現金');
      const post = (st.data as FundStorage[]).find((s) => s.name === '郵局');
      setAccountId(main?.id ?? ''); setStorageId(cash?.id ?? ''); setFromId(post?.id ?? ''); setToId(cash?.id ?? '');
      setLoading(false);
    })();
  }, []);

  const mainAccount = accounts.find((a) => a.kind === 'main');
  const advanceStorage = storages.find((s) => s.name === '代墊（待清償）');
  const activeStorages = storages.filter((s) => s.active && s.id !== advanceStorage?.id);
  const activeAccounts = accounts.filter((a) => a.active);
  const amountNum = Math.round(Number(amount)) || 0;
  const feeNum = Math.round(Number(fee)) || 0;

  const { latest } = useMemo(() => computeRunningBalances(transactions), [transactions]);

  // 各代墊者待清償：代墊存放位置上以 label 分組
  const advanceOutstanding = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of transactions) for (const l of t.fund_lines ?? []) {
      if (l.storage_id === advanceStorage?.id && l.label) out[l.label] = (out[l.label] ?? 0) - Number(l.amount);
    }
    return out;
  }, [transactions, advanceStorage]);

  const openLoans = loans.map((l) => ({ ...l, remaining: loanRemaining(l, repayments) })).filter((l) => l.remaining > 0);

  const name = (list: { id: number; name: string }[], id: number | '') => list.find((x) => x.id === id)?.name ?? '';

  // 套用模板
  const applyTemplate = (tpl: FundTemplate) => {
    if (tpl.kind === 'tags') { setSelTags((p) => Array.from(new Set([...p, ...tpl.tags]))); return; }
    const monthNow = `${new Date().getMonth() + 1}月`;
    setVendor(tpl.vendor ?? '');
    setDescription((tpl.description ?? '').replace(/N月/g, monthNow));
    setSelTags(tpl.tags);
    if (tpl.default_amount) setAmount(String(tpl.default_amount));
    const st = storages.find((x) => x.name === tpl.storage_name); if (st) setStorageId(st.id);
    const adv = advancers.find((x) => x.name === tpl.advancer_name); setAdvancerId(adv?.id ?? '');
    toast.success(`已套用「${tpl.name}」`);
  };
  // 同店家上一筆
  const lookupSame = async (v: string) => {
    const q = v.trim();
    if (q.length < 2) { setLastSame(null); return; }
    const { data } = await supabase.from('fund_expenses').select('*').ilike('vendor', `%${q}%`).order('id', { ascending: false }).limit(1);
    setLastSame((data?.[0] as FundExpense) ?? null);
  };
  const applySame = () => {
    if (!lastSame) return;
    setVendor(lastSame.vendor ?? ''); setDescription(lastSame.description ?? ''); setSelTags(lastSame.tags);
    const adv = advancers.find((x) => x.id === lastSame.advancer_id); setAdvancerId(adv?.id ?? '');
    setLastSame(null);
  };

  const reset = () => { setAmount(''); setComment(''); setVendor(''); setDescription(''); setVoucherNo(''); setSelTags([]); setAdvancerId(''); setLender(''); setFee(''); setSource(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mainAccount) return toast.error('找不到主科目');
    if (amountNum <= 0) return toast.error('請填金額');
    setSubmitting(true);
    try {
      let result: { id: number };
      const base = { occurred_on: date, comment: comment.trim() || null };
      if (kind === 'expense') {
        if (!accountId || !storageId) return toast.error('請選科目與付款來源');
        if (!vendor.trim() && !description.trim()) return toast.error('請填店家或說明');
        const advancer = advancers.find((a) => a.id === advancerId);
        const texts = buildExpenseTexts({
          vendor: vendor.trim(), description: description.trim(), voucherNo: voucherNo.trim(), tags: selTags,
          storageName: name(storages, storageId), accountName: name(accounts, accountId), advancerName: advancer?.name,
        });
        const line: NewLine = advancer && advanceStorage
          ? { account_id: accountId, storage_id: advanceStorage.id, amount: -amountNum, label: advancer.name }
          : { account_id: accountId, storage_id: storageId, amount: -amountNum };
        result = await insertTransaction({ ...base, type: 'expense', ...texts, amount: -amountNum }, [line], {
          table: 'fund_expenses',
          row: { vendor: vendor.trim() || null, description: description.trim() || null, voucher_no: voucherNo.trim() || null, tags: selTags, advancer_id: advancer?.id ?? null },
        });
      } else if (kind === 'advance_settle') {
        const advancer = advancers.find((a) => a.id === advancerId);
        if (!advancer || !advanceStorage || !storageId) return toast.error('請選代墊者與付款來源');
        const texts = buildAdvanceSettleTexts({ advancerName: advancer.name, storageName: name(storages, storageId), amount: amountNum });
        result = await insertTransaction({ ...base, type: 'transfer', ...texts, amount: 0 }, [
          { account_id: mainAccount.id, storage_id: storageId, amount: -amountNum },
          { account_id: mainAccount.id, storage_id: advanceStorage.id, amount: amountNum, label: advancer.name },
        ]);
      } else if (kind === 'loan') {
        if (!lender.trim() || !storageId) return toast.error('請填出借人與存放位置');
        const texts = buildLoanTexts({ lender: lender.trim(), storageName: name(storages, storageId) });
        result = await insertTransaction({ ...base, type: 'loan', ...texts, amount: amountNum },
          [{ account_id: mainAccount.id, storage_id: storageId, amount: amountNum }],
          { table: 'fund_loans', row: { lender_name: lender.trim(), principal: amountNum } });
      } else if (kind === 'repayment') {
        const loan = openLoans.find((l) => l.id === loanId);
        if (!loan || !storageId) return toast.error('請選借款與付款來源');
        if (amountNum > loan.remaining) return toast.error(`超過剩餘 ${loan.remaining} 元`);
        const texts = buildRepaymentTexts({ lender: loan.lender_name, storageName: name(storages, storageId), fee: feeNum });
        const lines: NewLine[] = [{ account_id: mainAccount.id, storage_id: storageId, amount: -amountNum }];
        if (feeNum) lines.push({ account_id: mainAccount.id, storage_id: storageId, amount: -feeNum, label: '手續費' });
        result = await insertTransaction({ ...base, type: 'repayment', ...texts, amount: -(amountNum + feeNum) }, lines,
          { table: 'fund_repayments', row: { loan_id: loan.id, amount: amountNum, fee: feeNum } });
      } else if (kind === 'transfer') {
        if (!fromId || !toId || fromId === toId) return toast.error('請選不同的來源與目的');
        const texts = buildTransferTexts({ fromName: name(storages, fromId), toName: name(storages, toId), amount: amountNum });
        result = await insertTransaction({ ...base, type: 'transfer', ...texts, amount: 0 }, [
          { account_id: mainAccount.id, storage_id: fromId, amount: -amountNum },
          { account_id: mainAccount.id, storage_id: toId, amount: amountNum },
        ]);
      } else {
        if (!source.trim() || !accountId || !storageId) return toast.error('請填來源、科目與存放位置');
        const texts = buildOtherIncomeTexts({ source: source.trim(), description: description.trim(), storageName: name(storages, storageId), accountName: name(accounts, accountId), refund: kind === 'refund' });
        result = await insertTransaction({ ...base, type: kind, ...texts, amount: amountNum },
          [{ account_id: accountId, storage_id: storageId, amount: amountNum }]);
      }
      toast.success(`已登錄 #${result.id}`);
      const tx = await fetchAllTransactions(supabase).then((data) => ({ data, error: null }), (error: Error) => ({ data: null, error }));
      if (tx.data) setTransactions(tx.data as FundTransaction[]);
      if (kind === 'loan') { const ln = await supabase.from('fund_loans').select('*').order('id'); if (ln.data) setLoans(ln.data as FundLoan[]); }
      if (kind === 'repayment') { const rp = await supabase.from('fund_repayments').select('*'); if (rp.data) setRepayments(rp.data as FundRepayment[]); }
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '寫入失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  const storageSelect = (value: number | '', onChange: (v: number | '') => void, list = activeStorages) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value) || '')} className={inputCls}>
      <option value="">— 請選擇 —</option>
      {list.map((s) => <option key={s.id} value={s.id}>{s.name}（{fmtAmount(latest.storages[s.id] ?? 0)}）</option>)}
    </select>
  );
  const accountSelect = (
    <select value={accountId} onChange={(e) => setAccountId(Number(e.target.value) || '')} className={inputCls}>
      {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}（{fmtAmount(latest.accounts[a.id] ?? 0)}）</option>)}
    </select>
  );
  const amountInput = (
    <input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
      className={`${inputCls} text-center text-2xl font-bold`} style={{ caretColor: '#00FF41' }} />
  );

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <PageHeader title="登錄交易" code="FUND_NEW" />
      <div className="max-w-2xl mx-auto w-full -mt-4 mb-6"><FundNav current="/fund/new" /></div>

      <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto space-y-6">
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([k, label]) => (
            <button type="button" key={k} onClick={() => setKind(k)} className={chipCls(kind === k, k === 'expense' || k === 'repayment')}>{label}</button>
          ))}
        </div>

        <Field label="日期："><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>

        {kind === 'expense' && (
          <>
            {templates.some((t) => t.kind === 'expense') && (
              <Field label="常用模板：">
                <div className="flex flex-wrap gap-2">
                  {templates.filter((t) => t.kind === 'expense').map((t) => <button type="button" key={t.id} onClick={() => applyTemplate(t)} className={chipCls(false)}>{t.name}</button>)}
                </div>
              </Field>
            )}
            <Field label="店家或對象：">
              <input value={vendor} onChange={(e) => { setVendor(e.target.value); lookupSame(e.target.value); }} placeholder="全聯福利中心" className={inputCls} />
              {lastSame && (
                <button type="button" onClick={applySame} className="mt-2 w-full text-left text-xs font-mono px-3 py-2 rounded border border-[#333333] text-gray-400 hover:border-[#00FF41] hover:text-[#00FF41]">
                  帶入上一筆「{lastSame.vendor}」：{lastSame.description ?? '—'}{lastSame.tags.length ? `　#${lastSame.tags.join(' #')}` : ''}
                </button>
              )}
            </Field>
            <Field label="說明（可寫品項）："><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="咖啡豆、衛生紙" className={`${inputCls} text-sm resize-none`} /></Field>
            <Field label="金額：">{amountInput}</Field>
            <Field label="憑證（非必填）：" hint="電子發票號碼如 WV-51039832，或匯款末五碼"><input value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} className={inputCls} /></Field>
            <Field label="從哪個科目扣：">{accountSelect}</Field>
            <Field label="代墊者："><div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAdvancerId('')} className={chipCls(advancerId === '')}>無（直接付款）</button>
              {advancers.map((a) => <button type="button" key={a.id} onClick={() => setAdvancerId(a.id)} className={chipCls(advancerId === a.id)}>{a.name}</button>)}
            </div></Field>
            {advancerId === '' && <Field label="從哪裡付：">{storageSelect(storageId, setStorageId)}</Field>}
            <Field label="標籤："><div className="space-y-2">
              {templates.some((t) => t.kind === 'tags') && (
                <div className="flex flex-wrap gap-2 pb-1 border-b border-[#222222]">
                  {templates.filter((t) => t.kind === 'tags').map((t) => <button type="button" key={t.id} onClick={() => applyTemplate(t)} className={`${chipCls(false)} border-dashed`}>＋{t.name}</button>)}
                </div>
              )}
              {(['space', 'nature', 'item'] as const).map((g) => (
                <div key={g}>
                  <div className="text-xs text-gray-600 font-mono mb-1">{TAG_GROUP_LABEL[g]}</div>
                  <div className="flex flex-wrap gap-2">
                    {tags.filter((t) => t.group === g).map((t) => (
                      <button type="button" key={t.id} onClick={() => setSelTags((p) => (p.includes(t.name) ? p.filter((x) => x !== t.name) : [...p, t.name]))} className={chipCls(selTags.includes(t.name))}>{t.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div></Field>
          </>
        )}

        {kind === 'advance_settle' && (
          <>
            <Field label="清償誰的代墊："><div className="flex flex-wrap gap-2">
              {advancers.map((a) => <button type="button" key={a.id} onClick={() => { setAdvancerId(a.id); setAmount(String(Math.max(0, advanceOutstanding[a.name] ?? 0))); }} className={chipCls(advancerId === a.id)}>{a.name}（待清償 {fmtAmount(advanceOutstanding[a.name] ?? 0)}）</button>)}
            </div></Field>
            <Field label="金額：">{amountInput}</Field>
            <Field label="從哪裡付：">{storageSelect(storageId, setStorageId)}</Field>
          </>
        )}

        {kind === 'loan' && (
          <>
            <Field label="出借人："><input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="巢穴人 嚴昕" className={inputCls} /></Field>
            <Field label="金額：">{amountInput}</Field>
            <Field label="錢進哪裡：" hint="會進不凍結零用金">{storageSelect(storageId, setStorageId)}</Field>
          </>
        )}

        {kind === 'repayment' && (
          <>
            <Field label="償還哪筆借款：">
              {openLoans.length === 0 ? <p className="text-gray-500 font-mono text-sm">沒有未清償的借款</p> : (
                <div className="space-y-2">
                  {openLoans.map((l) => (
                    <button type="button" key={l.id} onClick={() => setLoanId(l.id)} className={`${chipCls(loanId === l.id)} w-full text-left`}>
                      {l.lender_name}　本金 {fmtAmount(Number(l.principal))}　剩餘 {fmtAmount(l.remaining)}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label="還款金額（本金）：">{amountInput}</Field>
            <Field label="手續費："><input type="number" inputMode="numeric" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="12" className={inputCls} /></Field>
            <Field label="從哪裡付：">{storageSelect(storageId, setStorageId)}</Field>
          </>
        )}

        {kind === 'transfer' && (
          <>
            <Field label="從：">{storageSelect(fromId, setFromId)}</Field>
            <Field label="到：">{storageSelect(toId, setToId)}</Field>
            <Field label="金額：">{amountInput}</Field>
          </>
        )}

        {(kind === 'income' || kind === 'refund') && (
          <>
            <Field label="來源："><input value={source} onChange={(e) => setSource(e.target.value)} placeholder={kind === 'refund' ? '中央蘭室' : '巢穴思想沙龍'} className={inputCls} /></Field>
            <Field label="說明："><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === 'refund' ? '9月蘭室專款 未用盡之餘款回注' : '9月 營業收入'} className={inputCls} /></Field>
            <Field label="金額：">{amountInput}</Field>
            <Field label="進哪個科目：">{accountSelect}</Field>
            <Field label="錢進哪裡：">{storageSelect(storageId, setStorageId)}</Field>
          </>
        )}

        <Field label="留言（非必填）："><textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputCls} text-sm resize-none`} /></Field>

        <button type="submit" disabled={submitting} className={primaryBtnCls} style={{ boxShadow: '0 0 5px rgba(0,255,65,0.3)' }}>
          {submitting ? '寫入中…' : '> 登錄'}
        </button>
      </form>
    </div>
  );
}
