"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { fetchAllTransactions, deleteTransaction, updateTransaction, adjustTotal } from '@/lib/fund-db';
import { FundNav, BalanceCard, inputCls, chipCls } from './ui';
import {
  CATEGORY_OF, CATEGORIES, SUBTYPE_LABEL, computeRunningBalances, formatSnapshot, fmtAmount,
  type FundAccount, type FundStorage, type FundTransaction, type FundCategory, type BalanceSnapshot,
} from '@/lib/fund';

type EditField = 'occurred_on' | 'title' | 'voucher' | 'note' | 'comment' | 'amount';
const COLS: { key: EditField | 'category' | 'balance' | 'actions'; label: string; w: string }[] = [
  { key: 'category', label: '金流類型', w: 'w-24' }, { key: 'occurred_on', label: '日期', w: 'w-28' },
  { key: 'title', label: '品項說明', w: 'min-w-[14rem]' }, { key: 'voucher', label: '憑證', w: 'min-w-[11rem]' },
  { key: 'amount', label: '金額', w: 'w-24' }, { key: 'note', label: '備註', w: 'min-w-[14rem]' },
  { key: 'balance', label: '結算', w: 'w-32' }, { key: 'comment', label: '留言與其他備註', w: 'min-w-[10rem]' },
  { key: 'actions', label: '', w: 'w-16' },
];

interface CellProps {
  t: FundTransaction; field: EditField; multiline?: boolean;
  editing: { id: number; field: EditField } | null; draft: string; setDraft: (v: string) => void;
  startEdit: (t: FundTransaction, field: EditField) => void; save: () => void; cancel: () => void;
}

function Cell({ t, field, multiline = true, editing, draft, setDraft, startEdit, save, cancel }: CellProps) {
  const isEditing = editing?.id === t.id && editing.field === field;
  if (isEditing) {
    const common = {
      autoFocus: true, value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: save,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
      },
      className: `${inputCls} px-2 py-1 text-xs`,
    };
    return multiline ? <textarea rows={3} {...common} /> : <input {...common} />;
  }
  const raw = field === 'amount' ? fmtAmount(Number(t.amount)) : String(t[field] ?? '');
  const cls = field === 'amount' ? (Number(t.amount) >= 0 ? 'text-[#00FF41] text-right font-bold' : 'text-[#FF0055] text-right font-bold') : 'text-gray-300';
  return (
    <div onDoubleClick={() => startEdit(t, field)} title="雙擊編輯"
      className={`whitespace-pre-wrap font-mono text-xs cursor-text min-h-[1.5rem] rounded px-1 -mx-1 hover:bg-[rgba(0,255,65,0.06)] ${cls} ${!raw ? 'text-gray-700' : ''}`}>
      {raw || '—'}
    </div>
  );
}

export default function FundPage() {
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [accounts, setAccounts] = useState<FundAccount[]>([]);
  const [storages, setStorages] = useState<FundStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'table'>(() => (typeof window !== 'undefined' && window.innerWidth >= 900 ? 'table' : 'list'));
  const [category, setCategory] = useState<FundCategory | 'all'>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [showBalance, setShowBalance] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; field: EditField } | null>(null);
  const [editTotal, setEditTotal] = useState<{ id: number; value: string; storageId: number | '' } | null>(null);
  const [draft, setDraft] = useState('');

  const load = async () => {
    const [tx, ac, st] = await Promise.all([
      fetchAllTransactions(supabase).then((data) => ({ data: data.reverse(), error: null }), (error: Error) => ({ data: null, error })),
      supabase.from('fund_accounts').select('*').order('sort_order'),
      supabase.from('fund_storages').select('*').order('sort_order'),
    ]);
    const err = tx.error ?? ac.error ?? st.error;
    if (err) setError(err.message);
    else { setError(null); setTransactions(tx.data as FundTransaction[]); setAccounts(ac.data as FundAccount[]); setStorages(st.data as FundStorage[]); }
    setLoading(false);
  };
  useEffect(() => { (async () => { await load(); })(); }, []);

  const { snapshots, latest } = useMemo(() => computeRunningBalances(transactions), [transactions]);
  const mainAccount = accounts.find((a) => a.kind === 'main');
  const shown = transactions.filter((t) => category === 'all' || CATEGORY_OF[t.type] === category);
  const storageName = (id: number) => storages.find((s) => s.id === id)?.name ?? '?';
  const accountName = (id: number) => accounts.find((a) => a.id === id)?.name ?? '?';

  // ---- 就地編輯 ----
  const canEditAmount = (t: FundTransaction) => (t.fund_lines ?? []).length === 1 && t.type !== 'transfer';
  const startEdit = (t: FundTransaction, field: EditField) => {
    if (field === 'amount' && !canEditAmount(t)) return toast('多條明細的金額請刪除後重登', { icon: 'ℹ️' });
    setEditing({ id: t.id, field });
    setDraft(field === 'amount' ? String(t.amount) : String(t[field] ?? ''));
  };
  const cancelEdit = () => { setEditing(null); setDraft(''); };
  const saveEdit = async () => {
    if (!editing) return;
    const t = transactions.find((x) => x.id === editing.id);
    if (!t) return cancelEdit();
    const f = editing.field;
    try {
      if (f === 'amount') {
        const n = Math.round(Number(draft));
        if (!Number.isFinite(n)) return toast.error('金額格式錯誤');
        if (n === Number(t.amount)) return cancelEdit();
        await updateTransaction(t.id, { amount: n }, { lineId: t.fund_lines![0].id, amount: n });
      } else {
        const v = draft.trim();
        if (v === String(t[f] ?? '')) return cancelEdit();
        if (f === 'occurred_on' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return toast.error('日期格式 YYYY-MM-DD');
        if (f === 'title' && !v) return toast.error('品項說明不可空白');
        await updateTransaction(t.id, { [f]: f === 'occurred_on' || f === 'title' ? v : v || null });
      }
      cancelEdit(); await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : '更新失敗'); }
  };
  // 結算列的小結可改：差額記成矯正回歸，之後的餘額跟著重算
  const canEditTotal = (t: FundTransaction) => t.type === 'settlement' || t.type === 'opening';
  const startEditTotal = (t: FundTransaction) => {
    const snap = snapshots.get(t.id);
    const post = storages.find((s) => s.name === '郵局');
    setEditTotal({ id: t.id, value: String(snap?.total ?? 0), storageId: post?.id ?? '' });
  };
  const saveTotal = async () => {
    if (!editTotal || !mainAccount) return;
    const t = transactions.find((x) => x.id === editTotal.id);
    const snap = snapshots.get(editTotal.id);
    if (!t || !snap) return setEditTotal(null);
    const target = Math.round(Number(editTotal.value));
    if (!Number.isFinite(target)) return toast.error('金額格式錯誤');
    const diff = target - snap.total;
    if (!diff) return setEditTotal(null);
    if (!editTotal.storageId) return toast.error('請選差額記在哪個存放位置');
    if (!confirm(`小結 ${fmtAmount(snap.total)} → ${fmtAmount(target)}\n差額 ${fmtAmount(diff)} 會記為「矯正回歸」進不凍結零用金／${storageName(editTotal.storageId)}，之後每一筆的結算都會重算。確定？`)) return;
    try {
      await adjustTotal({ transactionId: t.id, diff, accountId: mainAccount.id, storageId: editTotal.storageId });
      toast.success('已調整，後續餘額已重算'); setEditTotal(null); await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : '調整失敗'); }
  };

  const remove = async (t: FundTransaction) => {
    if (!confirm(`刪除這筆？\n${t.occurred_on} ${t.title.split('\n')[0]} ${t.amount}`)) return;
    try { await deleteTransaction(t.id); toast.success('已刪除'); setOpen(null); await load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : '刪除失敗'); }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="text-[#00FF41] font-mono">載入中...</div></div>;
  if (error) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="text-[#FF0055] font-mono mb-4">{error}</div>
      <button onClick={load} className="text-sm text-gray-500 hover:text-[#00FF41] font-mono">重新載入</button>
    </div>
  );

  const cellProps = { editing, draft, setDraft, startEdit, save: saveEdit, cancel: cancelEdit };
  const catColor = (c: FundCategory) => c === '收入' ? 'border-[#00FF41] text-[#00FF41]' : c === '支出' ? 'border-[#FF0055] text-[#FF0055]' : c === '轉帳' ? 'border-[#FFB000] text-[#FFB000]' : 'border-[#8888ff] text-[#8888ff]';
  const CategoryChip = ({ t }: { t: FundTransaction }) => (
    <span className={`inline-flex flex-col items-start text-xs font-mono px-2 py-1 rounded border ${catColor(CATEGORY_OF[t.type])}`}>
      {CATEGORY_OF[t.type]}
      {SUBTYPE_LABEL[t.type] !== CATEGORY_OF[t.type] && <span className="text-[10px] text-gray-500">{SUBTYPE_LABEL[t.type]}</span>}
    </span>
  );
  const transferSummary = (t: FundTransaction) => {
    const lines = t.fund_lines ?? [];
    const from = lines.find((l) => Number(l.amount) < 0), to = lines.find((l) => Number(l.amount) > 0);
    return from && to ? `${storageName(from.storage_id)} → ${storageName(to.storage_id)}　${fmtAmount(Number(to.amount))}` : t.title;
  };
  const BalanceMini = ({ s, t }: { s?: BalanceSnapshot; t: FundTransaction }) => {
    if (!s) return null;
    if (editTotal?.id === t.id) {
      return (
        <div className="font-mono text-xs space-y-1" onClick={(e) => e.stopPropagation()}>
          <input autoFocus type="number" value={editTotal.value} onChange={(e) => setEditTotal({ ...editTotal, value: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveTotal(); } if (e.key === 'Escape') setEditTotal(null); }}
            className={`${inputCls} px-2 py-1 text-xs w-28`} />
          <select value={editTotal.storageId} onChange={(e) => setEditTotal({ ...editTotal, storageId: Number(e.target.value) || '' })} className={`${inputCls} px-2 py-1 text-xs w-28`}>
            {storages.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>差額→{x.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={saveTotal} className="text-[#00FF41]">儲存</button>
            <button type="button" onClick={() => setEditTotal(null)} className="text-gray-500">取消</button>
          </div>
        </div>
      );
    }
    return (
      <div className="font-mono text-xs leading-tight">
        <div className={`text-white ${canEditTotal(t) ? 'cursor-text hover:text-[#00FF41]' : ''}`} title={canEditTotal(t) ? '雙擊修改小結' : undefined}
          onDoubleClick={(e) => { if (canEditTotal(t)) { e.stopPropagation(); startEditTotal(t); } }}>
          小結 {fmtAmount(s.total)}{canEditTotal(t) && <span className="text-gray-600 ml-1">✎</span>}
        </div>
        {mainAccount && <div className="text-gray-500">零用 {fmtAmount(s.accounts[mainAccount.id] ?? 0)}</div>}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <header className="mb-6 max-w-6xl mx-auto w-full">
        <Link href="/" className="inline-block text-sm text-gray-500 hover:text-[#00FF41] font-mono mb-4">← 返回首頁</Link>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{ textShadow: '0 0 10px rgba(0,255,65,0.3)' }}>公基金 流水帳</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">{'// FUND_LEDGER'}</p>
        <FundNav current="/fund" />
      </header>

      <main className="w-full max-w-6xl mx-auto space-y-6">
        <BalanceCard snapshot={latest} accounts={accounts} storages={storages} asOf={transactions[0]?.occurred_on} />

        <div className="flex flex-wrap items-center gap-2 text-sm font-mono">
          <button onClick={() => setCategory('all')} className={chipCls(category === 'all')}>全部</button>
          {CATEGORIES.map((c) => <button key={c} onClick={() => setCategory(c)} className={chipCls(category === c)}>{c}</button>)}
          <span className="text-gray-600 ml-2">{shown.length} 筆</span>
          <div className="ml-auto flex gap-1">
            <button onClick={() => setView('list')} className={chipCls(view === 'list')}>列表</button>
            <button onClick={() => setView('table')} className={chipCls(view === 'table')}>表格</button>
          </div>
        </div>

        {shown.length === 0 ? (
          <p className="text-gray-500 font-mono text-center py-8">還沒有紀錄</p>
        ) : view === 'table' ? (
          <div className="overflow-x-auto border border-[#333333] rounded">
            <p className="text-[10px] text-gray-600 font-mono px-3 py-1 border-b border-[#222222]">雙擊儲存格編輯，Enter 儲存（多行欄位用 ⌘Enter），Esc 取消。金額欄僅單一明細可改，結算欄由系統計算。</p>
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-black z-10">
                <tr className="text-gray-500 font-mono text-left">
                  {COLS.map((c) => <th key={c.key} className={`px-2 py-2 border-b border-[#333333] font-normal ${c.w}`}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const snap = snapshots.get(t.id);
                  const isTransfer = t.type === 'transfer';
                  if (isTransfer) {
                    // 轉帳列不套表頭，整列合併成一條
                    return (
                      <tr key={t.id} className="border-b border-[#1a1a1a] bg-[rgba(255,176,0,0.04)] hover:bg-[rgba(255,176,0,0.08)]">
                        <td className="px-2 py-2" colSpan={COLS.length}>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <CategoryChip t={t} />
                            <div className="w-24"><Cell t={t} field="occurred_on" multiline={false} {...cellProps} /></div>
                            <div className="font-mono text-sm text-[#FFB000] whitespace-nowrap">{transferSummary(t)}</div>
                            <div className="text-gray-500 font-mono text-[11px] whitespace-pre-wrap flex-1 min-w-[10rem]">{t.note}</div>
                            <div className="min-w-[8rem]"><Cell t={t} field="comment" multiline={false} {...cellProps} /></div>
                            <button onClick={() => setShowBalance(showBalance === t.id ? null : t.id)} className="text-left"><BalanceMini s={snap} t={t} /></button>
                            <button onClick={() => remove(t)} className="text-gray-600 hover:text-[#FF0055] font-mono text-xs">刪除</button>
                          </div>
                          {showBalance === t.id && snap && <pre className="mt-2 text-[10px] text-gray-400 font-mono whitespace-pre-wrap">{formatSnapshot(snap, accounts, storages)}</pre>}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={t.id} className="align-top border-b border-[#1a1a1a] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-2 py-2"><CategoryChip t={t} /></td>
                      <td className="px-2 py-2"><Cell t={t} field="occurred_on" multiline={false} {...cellProps} /></td>
                      <td className="px-2 py-2"><Cell t={t} field="title" {...cellProps} /></td>
                      <td className="px-2 py-2"><Cell t={t} field="voucher" {...cellProps} /></td>
                      <td className="px-2 py-2"><Cell t={t} field="amount" multiline={false} {...cellProps} /></td>
                      <td className="px-2 py-2"><Cell t={t} field="note" {...cellProps} /></td>
                      <td className="px-2 py-2">
                        <button onClick={() => setShowBalance(showBalance === t.id ? null : t.id)} className="text-left"><BalanceMini s={snap} t={t} /></button>
                        {showBalance === t.id && snap && <pre className="mt-2 text-[10px] text-gray-400 font-mono whitespace-pre-wrap">{formatSnapshot(snap, accounts, storages)}</pre>}
                      </td>
                      <td className="px-2 py-2"><Cell t={t} field="comment" {...cellProps} /></td>
                      <td className="px-2 py-2">
                        <button onClick={() => remove(t)} className="text-gray-600 hover:text-[#FF0055] font-mono">刪除</button>
                        {(t.fund_lines ?? []).length > 1 && (
                          <div className="text-[10px] text-gray-600 font-mono mt-1">
                            {(t.fund_lines ?? []).map((l) => <div key={l.id}>{accountName(l.account_id)}/{storageName(l.storage_id)} {fmtAmount(Number(l.amount))}</div>)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2">
            {shown.map((t) => {
              const snap = snapshots.get(t.id);
              const isOpen = open === t.id;
              const isTransfer = t.type === 'transfer';
              return (
                <div key={t.id} className="border border-[#333333] rounded bg-[#0a0a0a]">
                  <div role="button" tabIndex={0} onClick={() => setOpen(isOpen ? null : t.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(isOpen ? null : t.id); }} className="w-full p-3 text-left hover:bg-[rgba(255,255,255,0.02)] cursor-pointer">
                    <div className="flex items-start gap-3">
                      <CategoryChip t={t} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-500 font-mono">{t.occurred_on}</div>
                        <div className="text-white text-sm truncate">{isTransfer ? transferSummary(t) : t.title.split('\n')[0]}</div>
                      </div>
                      <div className="text-right shrink-0">
                        {!isTransfer && <div className={`font-mono font-bold ${Number(t.amount) >= 0 ? 'text-[#00FF41]' : 'text-[#FF0055]'}`}>{fmtAmount(Number(t.amount))}</div>}
                        <BalanceMini s={snap} t={t} />
                      </div>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3 text-xs font-mono">
                      {(['title', 'voucher', 'note', 'comment'] as EditField[]).map((f) => (
                        <div key={f}>
                          <div className="text-gray-600 mb-1">{{ title: '品項說明', voucher: '憑證', note: '備註', comment: '留言' }[f as 'title' | 'voucher' | 'note' | 'comment']}</div>
                          <Cell t={t} field={f} {...cellProps} />
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-3">
                        <div><div className="text-gray-600 mb-1">日期</div><Cell t={t} field="occurred_on" multiline={false} {...cellProps} /></div>
                        <div><div className="text-gray-600 mb-1">金額</div><Cell t={t} field="amount" multiline={false} {...cellProps} /></div>
                      </div>
                      <div>
                        <div className="text-gray-600 mb-1">明細</div>
                        {(t.fund_lines ?? []).map((l) => <div key={l.id} className="text-gray-300">{accountName(l.account_id)} / {storageName(l.storage_id)}：{fmtAmount(Number(l.amount))}{l.label ? `（${l.label}）` : ''}</div>)}
                      </div>
                      <div><div className="text-gray-600 mb-1">結算</div><pre className="text-gray-300 whitespace-pre-wrap">{snap ? formatSnapshot(snap, accounts, storages) : '—'}</pre></div>
                      <div className="flex pt-2 border-t border-[#222222]">
                        <span className="text-gray-600">雙擊欄位可直接修改</span>
                        <button onClick={() => remove(t)} className="ml-auto px-3 py-1 rounded border border-[#333333] text-gray-300 hover:border-[#FF0055] hover:text-[#FF0055]">刪除</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
