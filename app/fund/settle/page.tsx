"use client";

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { insertTransaction, type NewLine } from '@/lib/fund-db';
import {
  computeRunningBalances, fmtAmount, loanRemaining, recentMonths, monthLabel, todayISO, FREEZE_RATE,
  buildRepaymentTexts, type BalanceSnapshot,
  type FundAccount, type FundStorage, type FundTransaction, type FundLoan, type FundRepayment, type FundSettlement,
} from '@/lib/fund';
import { Field, FundNav, PageHeader, Loading, ErrorBox, BalanceCard, inputCls, chipCls, primaryBtnCls } from '../ui';

/** 一條調動：從（科目、存放）搬到（科目、存放） */
interface Move { id: number; fromAccount: number | ''; fromStorage: number | ''; toAccount: number | ''; toStorage: number | ''; amount: string; label: string }
interface Repay { amount: string; fee: string; storage: number | '' }

let moveSeq = 1;

export default function SettlePage() {
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [storages, setStorages] = useState<FundStorage[]>([]);
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [loans, setLoans] = useState<FundLoan[]>([]);
  const [repayments, setRepayments] = useState<FundRepayment[]>([]);
  const [settlements, setSettlements] = useState<FundSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [month, setMonth] = useState(() => recentMonths(2)[0]);
  const [date, setDate] = useState(todayISO());
  const [moves, setMoves] = useState<Move[]>([]);
  const [repay, setRepay] = useState<Record<number, Repay>>({});
  const [actualPost, setActualPost] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [noteDraft, setNoteDraft] = useState<string | null>(null); // null = 用系統產生的
  const [extraNote, setExtraNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [ac, st, tx, ln, rp, se] = await Promise.all([
      supabase.from('fund_accounts').select('*').order('sort_order'),
      supabase.from('fund_storages').select('*').order('sort_order'),
      supabase.from('fund_transactions').select('*, fund_lines(*)'),
      supabase.from('fund_loans').select('*').order('id'),
      supabase.from('fund_repayments').select('*'),
      supabase.from('fund_settlements').select('*'),
    ]);
    const err = ac.error ?? st.error ?? tx.error ?? ln.error ?? rp.error ?? se.error;
    if (err) { setError(err.message); setLoading(false); return; }
    setAccounts(ac.data as FundAccount[]); setStorages(st.data as FundStorage[]); setTransactions(tx.data as FundTransaction[]);
    setLoans(ln.data as FundLoan[]); setRepayments(rp.data as FundRepayment[]); setSettlements(se.data as FundSettlement[]);
    setLoading(false);
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  const { latest } = useMemo(() => computeRunningBalances(transactions), [transactions]);
  const main = accounts.find((a) => a.kind === 'main');
  const reserve = accounts.find((a) => a.name === '緊急應變備用金');
  const future = accounts.find((a) => a.name === '共存前瞻預算');
  const post = storages.find((s) => s.name === '郵局');
  const cash = storages.find((s) => s.name === '現金');
  const activeAccounts = accounts.filter((a) => a.active);
  const activeStorages = storages.filter((s) => s.active);
  const openLoans = loans.map((l) => ({ ...l, remaining: loanRemaining(l, repayments) })).filter((l) => l.remaining > 0);
  const alreadySettled = settlements.some((s) => s.month === month);
  const remainingBefore = main ? latest.accounts[main.id] ?? 0 : 0;

  // ---- 調動列 ----
  const newMove = (p: Partial<Move> = {}): Move => ({
    id: moveSeq++, fromAccount: main?.id ?? '', fromStorage: post?.id ?? '', toAccount: '', toStorage: post?.id ?? '', amount: '', label: '', ...p,
  });
  const addMove = (p?: Partial<Move>) => setMoves((m) => [...m, newMove(p)]);
  const patchMove = (id: number, p: Partial<Move>) => setMoves((m) => m.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const removeMove = (id: number) => setMoves((m) => m.filter((x) => x.id !== id));
  const onToAccountChange = (mv: Move, accId: number | '') => {
    const acc = accounts.find((a) => a.id === accId);
    patchMove(mv.id, { toAccount: accId, toStorage: acc?.default_storage_id ?? mv.toStorage });
  };

  // 快捷：依章程 30%/30%
  const addFreeze = () => {
    if (!main || !reserve || !future || !post) return;
    const f = remainingBefore > 0 ? Math.floor(remainingBefore * FREEZE_RATE) : 0;
    setMoves((m) => [
      ...m,
      newMove({ toAccount: reserve.id, toStorage: post.id, amount: String(f), label: '凍存' }),
      newMove({ toAccount: future.id, toStorage: post.id, amount: String(f), label: '凍存' }),
    ]);
  };
  // 快捷：郵局提領到現金袋
  const addWithdraw = () => { if (main && post && cash) addMove({ toAccount: main.id, toStorage: cash.id, label: '提領' }); };

  // ---- 還款 ----
  const repayList = openLoans.map((l) => ({ loan: l, amount: Math.round(Number(repay[l.id]?.amount)) || 0, fee: Math.round(Number(repay[l.id]?.fee)) || 0, storage: (repay[l.id]?.storage || post?.id || '') as number | '' }));

  // ---- 結算後預覽 ----
  const validMoves = moves.map((m) => ({ ...m, n: Math.round(Number(m.amount)) || 0 })).filter((m) => m.n > 0 && m.fromAccount && m.fromStorage && m.toAccount && m.toStorage);
  const preview: BalanceSnapshot = useMemo(() => {
    const p: BalanceSnapshot = { accounts: { ...latest.accounts }, storages: { ...latest.storages }, total: latest.total };
    const apply = (acc: number, sto: number, amt: number) => { p.accounts[acc] = (p.accounts[acc] ?? 0) + amt; p.storages[sto] = (p.storages[sto] ?? 0) + amt; p.total += amt; };
    for (const m of validMoves) { apply(m.fromAccount as number, m.fromStorage as number, -m.n); apply(m.toAccount as number, m.toStorage as number, m.n); }
    for (const r of repayList) if (main && r.storage) { apply(main.id, r.storage as number, -(r.amount + r.fee)); }
    return p;
  }, [latest, validMoves, repayList, main]);
  const remainingAfter = main ? preview.accounts[main.id] ?? 0 : 0;
  const systemPost = post ? preview.storages[post.id] ?? 0 : 0;
  const systemCash = cash ? preview.storages[cash.id] ?? 0 : 0;
  const diffPost = actualPost === '' ? null : Math.round(Number(actualPost)) - systemPost;
  const diffCash = actualCash === '' ? null : Math.round(Number(actualCash)) - systemCash;
  const negatives = [...accounts.filter((a) => (preview.accounts[a.id] ?? 0) < 0 && a.kind !== 'special').map((a) => a.name), ...storages.filter((s) => (preview.storages[s.id] ?? 0) < 0 && !s.name.startsWith('代墊')).map((s) => s.name)];

  // ---- 備註（總表格式） ----
  const accName = (id: number | '') => accounts.find((a) => a.id === id)?.name ?? '';
  const stoName = (id: number | '') => storages.find((s) => s.id === id)?.name ?? '';
  const generatedNote = useMemo(() => {
    const lines = [`#不凍結零用金剩餘：${remainingBefore}`];
    const freezes = validMoves.filter((m) => m.label === '凍存');
    if (freezes.length) lines.push(`#${remainingBefore}*${FREEZE_RATE * 100}%=${Math.floor(remainingBefore * FREEZE_RATE)}`);
    for (const m of validMoves) {
      if (m.fromAccount === m.toAccount) lines.push(`#「${stoName(m.fromStorage)}」轉入「${stoName(m.toStorage)}」${m.n}元`);
      else if (m.label === '凍存') lines.push(`#${accName(m.fromAccount)}${m.n}元以「${accName(m.toAccount)}」凍存`);
      else lines.push(`#${accName(m.fromAccount)}${m.n}元撥入「${accName(m.toAccount)}」${m.fromStorage !== m.toStorage ? `（${stoName(m.fromStorage)}→${stoName(m.toStorage)}）` : ''}`);
    }
    const rs = repayList.filter((r) => r.amount > 0);
    if (rs.length) {
      lines.push('');
      for (const r of rs) { lines.push(`#不凍結零用金${r.amount}元用以償還${r.fee ? `（${r.fee}元手續費）` : ''}`); lines.push(`${r.loan.lender_name}所提供之「巢穴緊急紓困借款」`); }
      lines.push('');
      for (const r of rs) lines.push(`${r.loan.lender_name}借款 剩餘${r.loan.remaining - r.amount}元 尚待償還`);
    }
    lines.push(`#不凍結零用金預留${remainingAfter}元`);
    if (diffPost !== null && diffPost !== 0) lines.push(`#「郵局」矯正回歸 ${diffPost > 0 ? '+' : ''}${diffPost}元`);
    if (diffCash !== null && diffCash !== 0) lines.push(`#「現金袋」矯正回歸 ${diffCash > 0 ? '+' : ''}${diffCash}元`);
    if (extraNote.trim()) lines.push('', extraNote.trim());
    return lines.join('\n');
  }, [validMoves, repayList, remainingBefore, remainingAfter, diffPost, diffCash, extraNote, accounts, storages]); // eslint-disable-line react-hooks/exhaustive-deps
  const note = noteDraft ?? generatedNote;

  // ---- 寫入 ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!main || !post) return toast.error('科目或存放位置不完整');
    if (!validMoves.length && !repayList.some((r) => r.amount > 0)) return toast.error('還沒有任何調動或還款');
    for (const r of repayList) if (r.amount > r.loan.remaining) return toast.error(`${r.loan.lender_name} 還款超過剩餘`);
    if (negatives.length && !confirm(`結算後這些會變負數：${negatives.join('、')}\n仍要寫入？`)) return;
    if (alreadySettled && !confirm(`${monthLabel(month)} 已經結算過，要再寫一筆嗎？`)) return;
    setSubmitting(true);
    try {
      for (const r of repayList) {
        if (r.amount <= 0 || !r.storage) continue;
        const texts = buildRepaymentTexts({ lender: r.loan.lender_name, storageName: stoName(r.storage as number), fee: r.fee });
        const lines: NewLine[] = [{ account_id: main.id, storage_id: r.storage as number, amount: -r.amount }];
        if (r.fee) lines.push({ account_id: main.id, storage_id: r.storage as number, amount: -r.fee, label: '手續費' });
        await insertTransaction({ type: 'repayment', occurred_on: date, seq: 1, ...texts, amount: -(r.amount + r.fee) }, lines,
          { table: 'fund_repayments', row: { loan_id: r.loan.id, amount: r.amount, fee: r.fee } });
      }
      const lines: NewLine[] = [];
      for (const m of validMoves) {
        lines.push({ account_id: m.fromAccount as number, storage_id: m.fromStorage as number, amount: -m.n, label: m.label || null });
        lines.push({ account_id: m.toAccount as number, storage_id: m.toStorage as number, amount: m.n, label: m.label || null });
      }
      // 矯正回歸：實際與系統差額，記在不凍結零用金
      if (diffPost) lines.push({ account_id: main.id, storage_id: post.id, amount: diffPost, label: '矯正回歸' });
      if (diffCash && cash) lines.push({ account_id: main.id, storage_id: cash.id, amount: diffCash, label: '矯正回歸' });
      await insertTransaction({ type: 'settlement', occurred_on: date, seq: 2, title: `***${monthLabel(month)}結算***`, voucher: '#郵局帳戶\n#現金袋', note, amount: 0, comment: null }, lines, {
        table: 'fund_settlements',
        row: { month, actual_post: actualPost === '' ? null : Math.round(Number(actualPost)), actual_cash: actualCash === '' ? null : Math.round(Number(actualCash)), system_post: systemPost, system_cash: systemCash },
      });
      toast.success(`${monthLabel(month)}結算已寫入`);
      setMoves([]); setRepay({}); setActualPost(''); setActualCash(''); setNoteDraft(null); setExtraNote('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '寫入失敗');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  const selectAcc = (value: number | '', onChange: (v: number | '') => void) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value) || '')} className={`${inputCls} px-2 py-2 text-xs`}>
      <option value="">科目</option>
      {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
  const selectSto = (value: number | '', onChange: (v: number | '') => void) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value) || '')} className={`${inputCls} px-2 py-2 text-xs`}>
      <option value="">存放</option>
      {activeStorages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <PageHeader title="月結算" code="FUND_SETTLE" />
      <div className="max-w-2xl mx-auto w-full -mt-4 mb-6"><FundNav current="/fund/settle" /></div>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto space-y-8">
        {/* 1. 月份與日期 */}
        <section className="space-y-3">
          <Field label="結算月份：">
            <div className="flex flex-wrap gap-2">
              {recentMonths(3).map((m) => <button type="button" key={m} onClick={() => setMonth(m)} className={chipCls(month === m)}>{m.slice(0, 4)} {monthLabel(m)}</button>)}
            </div>
            {alreadySettled && <p className="text-xs text-[#FFB000] font-mono mt-2">這個月已有結算紀錄</p>}
          </Field>
          <Field label="結算日期："><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
        </section>

        {/* 2. 結算前 */}
        <BalanceCard snapshot={latest} accounts={accounts} storages={storages} title="結算前" />

        {/* 3. 調動 */}
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm text-gray-400 font-mono">帳戶調動</h2>
            <span className="text-xs text-gray-600 font-mono">從哪裡搬到哪裡</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addFreeze} className={chipCls(false)}>＋ 依章程凍存 30%／30%</button>
            <button type="button" onClick={addWithdraw} className={chipCls(false)}>＋ 郵局提領到現金袋</button>
            <button type="button" onClick={() => addMove()} className={chipCls(false)}>＋ 自訂一條</button>
          </div>
          {moves.length === 0 && <p className="text-xs text-gray-600 font-mono">尚未加入任何調動</p>}
          <div className="space-y-2">
            {moves.map((mv) => (
              <div key={mv.id} className="p-3 border border-[#333333] rounded bg-[#0a0a0a] space-y-2">
                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  <div className="space-y-1">
                    <div className="text-[10px] text-gray-600 font-mono">從</div>
                    {selectAcc(mv.fromAccount, (v) => patchMove(mv.id, { fromAccount: v }))}
                    {selectSto(mv.fromStorage, (v) => patchMove(mv.id, { fromStorage: v }))}
                  </div>
                  <div className="space-y-1">
                    <div className="text-[10px] text-gray-600 font-mono">到</div>
                    {selectAcc(mv.toAccount, (v) => onToAccountChange(mv, v))}
                    {selectSto(mv.toStorage, (v) => patchMove(mv.id, { toStorage: v }))}
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <input type="number" inputMode="numeric" min={1} value={mv.amount} onChange={(e) => patchMove(mv.id, { amount: e.target.value })} placeholder="金額" className={`${inputCls} px-2 py-2 text-sm font-bold text-center`} />
                  <input value={mv.label} onChange={(e) => patchMove(mv.id, { label: e.target.value })} placeholder="標記（凍存、提領…）" className={`${inputCls} px-2 py-2 text-xs`} />
                  <button type="button" onClick={() => removeMove(mv.id)} className="text-[#FF0055] font-mono px-2 shrink-0">×</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. 還款 */}
        {openLoans.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm text-gray-400 font-mono">借款還款</h2>
            {openLoans.map((l) => (
              <div key={l.id} className="p-3 border border-[#333333] rounded bg-[#0a0a0a] space-y-2">
                <div className="text-sm text-white">{l.lender_name}　<span className="text-gray-500 font-mono text-xs">剩餘 {fmtAmount(l.remaining)}</span></div>
                <div className="flex gap-2">
                  <input type="number" inputMode="numeric" min={0} placeholder="本金" value={repay[l.id]?.amount ?? ''} onChange={(e) => setRepay((p) => ({ ...p, [l.id]: { amount: e.target.value, fee: p[l.id]?.fee ?? '', storage: p[l.id]?.storage ?? post?.id ?? '' } }))} className={`${inputCls} px-2 py-2 text-sm`} />
                  <input type="number" inputMode="numeric" min={0} placeholder="手續費" value={repay[l.id]?.fee ?? ''} onChange={(e) => setRepay((p) => ({ ...p, [l.id]: { amount: p[l.id]?.amount ?? '', fee: e.target.value, storage: p[l.id]?.storage ?? post?.id ?? '' } }))} className={`${inputCls} px-2 py-2 text-sm w-24`} />
                  <div className="w-32">{selectSto(repay[l.id]?.storage ?? post?.id ?? '', (v) => setRepay((p) => ({ ...p, [l.id]: { amount: p[l.id]?.amount ?? '', fee: p[l.id]?.fee ?? '', storage: v } })))}</div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* 5. 結算後預覽 */}
        <BalanceCard snapshot={preview} accounts={accounts} storages={storages} title="結算後（預覽）" />
        {negatives.length > 0 && <p className="text-xs text-[#FF0055] font-mono">結算後會變負數：{negatives.join('、')}</p>}

        {/* 6. 實際餘額核對 */}
        <section className="space-y-3">
          <h2 className="text-sm text-gray-400 font-mono">實際餘額核對</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="郵局：" hint={diffPost === null ? `系統 ${fmtAmount(systemPost)}` : `系統 ${fmtAmount(systemPost)}，差 ${fmtAmount(diffPost)}`}>
              <input type="number" inputMode="numeric" value={actualPost} onChange={(e) => setActualPost(e.target.value)} className={inputCls} />
            </Field>
            <Field label="現金袋：" hint={diffCash === null ? `系統 ${fmtAmount(systemCash)}` : `系統 ${fmtAmount(systemCash)}，差 ${fmtAmount(diffCash)}`}>
              <input type="number" inputMode="numeric" value={actualCash} onChange={(e) => setActualCash(e.target.value)} className={inputCls} />
            </Field>
          </div>
          {(diffPost || diffCash) ? <p className="text-xs text-[#FFB000] font-mono">有差額時會以「矯正回歸」記入不凍結零用金，讓系統餘額對齊實際。</p> : null}
        </section>

        {/* 7. 備註 */}
        <section className="space-y-3">
          <Field label="其他備註（會附在結算備註最後）："><textarea rows={2} value={extraNote} onChange={(e) => setExtraNote(e.target.value)} placeholder="因資金不足 未支付9月【中央蘭室專款】" className={`${inputCls} text-sm resize-none`} /></Field>
          <Field label="結算備註（總表格式，可直接修改）：">
            <textarea rows={10} value={note} onChange={(e) => setNoteDraft(e.target.value)} className={`${inputCls} text-xs resize-y`} />
            {noteDraft !== null && <button type="button" onClick={() => setNoteDraft(null)} className="text-xs text-gray-500 hover:text-[#00FF41] font-mono mt-1">還原成系統產生的</button>}
          </Field>
        </section>

        <button type="submit" disabled={submitting} className={primaryBtnCls} style={{ boxShadow: '0 0 5px rgba(0,255,65,0.3)' }}>
          {submitting ? '寫入中…' : `> 確認 ${monthLabel(month)}結算`}
        </button>
      </form>
    </div>
  );
}
