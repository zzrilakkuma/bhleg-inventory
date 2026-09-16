"use client";

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { FundNav, PageHeader, Loading, ErrorBox, inputCls, chipCls } from '../ui';

type Row = { id: number; active: boolean; sort_order: number } & Record<string, unknown>;

interface Column { key: string; label: string; type?: 'text' | 'select'; options?: string[]; required?: boolean }
interface TableDef { table: string; label: string; columns: Column[] }

const TABLES: TableDef[] = [
  { table: 'fund_members', label: '成員', columns: [
    { key: 'nickname', label: '暱稱', required: true }, { key: 'real_name', label: '本名' },
    { key: 'role', label: '身分', type: 'select', options: ['巢穴人', '巢穴眾', '外家代表'] }, { key: 'default_last5', label: '末五碼' },
  ] },
  { table: 'fund_accounts', label: '科目', columns: [
    { key: 'name', label: '名稱', required: true }, { key: 'kind', label: '種類', type: 'select', options: ['reserve', 'group', 'special'] },
  ] },
  { table: 'fund_storages', label: '存放位置', columns: [{ key: 'name', label: '名稱', required: true }] },
  { table: 'fund_handlers', label: '經手人', columns: [{ key: 'name', label: '名稱', required: true }] },
  { table: 'fund_advancers', label: '代墊者', columns: [{ key: 'name', label: '名稱', required: true }] },
  { table: 'fund_tags', label: '標籤', columns: [
    { key: 'name', label: '名稱', required: true }, { key: 'group', label: '分組', type: 'select', options: ['space', 'nature', 'item'] },
  ] },
];

export default function ManagePage() {
  const [tab, setTab] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showInactive, setShowInactive] = useState(false);

  const def = TABLES[tab];

  const load = async (t = def) => {
    const { data, error } = await supabase.from(t.table).select('*').order('sort_order').order('id');
    if (error) setError(error.message); else { setRows(data as Row[]); setError(null); }
    setLoading(false);
  };
  useEffect(() => { (async () => { await load(TABLES[tab]); })(); }, [tab]);

  const labelOf = (r: Row) => String(r[def.columns[0].key] ?? '');

  const toggle = async (r: Row) => {
    const { error } = await supabase.from(def.table).update({ active: !r.active }).eq('id', r.id);
    if (error) return toast.error(error.message);
    setRows((p) => p.map((x) => (x.id === r.id ? { ...x, active: !r.active } : x)));
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const row: Record<string, unknown> = {};
    for (const c of def.columns) {
      const v = (draft[c.key] ?? '').trim();
      if (c.required && !v) return toast.error(`請填${c.label}`);
      row[c.key] = v || (c.type === 'select' ? c.options?.[0] : null);
    }
    row.sort_order = (rows.reduce((m, r) => Math.max(m, r.sort_order), 0) || 0) + 1;
    const { error } = await supabase.from(def.table).insert(row);
    if (error) return toast.error(error.message);
    toast.success('已新增'); setDraft({}); await load();
  };

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  const shown = rows.filter((r) => showInactive || r.active);

  return (
    <div className="flex min-h-screen flex-col px-4 py-8">
      <PageHeader title="管理" code="FUND_MANAGE" />
      <div className="max-w-2xl mx-auto w-full -mt-4 mb-6"><FundNav current="/fund/manage" /></div>

      <main className="w-full max-w-md mx-auto space-y-6">
        <div className="flex flex-wrap gap-2">
          {TABLES.map((t, i) => <button key={t.table} onClick={() => { setTab(i); setDraft({}); }} className={chipCls(tab === i)}>{t.label}</button>)}
        </div>

        <form onSubmit={add} className="p-4 border border-[#333333] rounded bg-[#0a0a0a] space-y-3">
          <p className="text-xs text-gray-500 font-mono">新增{def.label}</p>
          {def.columns.map((c) => (
            c.type === 'select' ? (
              <select key={c.key} value={draft[c.key] ?? c.options?.[0]} onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))} className={inputCls}>
                {c.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input key={c.key} value={draft[c.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))} placeholder={c.label} className={inputCls} />
            )
          ))}
          <button type="submit" className="w-full py-3 rounded border border-[#00FF41] text-[#00FF41] font-mono text-sm">+ 新增</button>
        </form>

        <label className="flex items-center gap-2 text-sm text-gray-500 font-mono">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> 顯示已停用
        </label>

        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className={`flex items-center justify-between p-3 border rounded ${r.active ? 'border-[#333333]' : 'border-[#222222] opacity-50'}`}>
              <div className="min-w-0">
                <div className="text-white text-sm truncate">{labelOf(r)}</div>
                <div className="text-xs text-gray-500 font-mono truncate">
                  {def.columns.slice(1).map((c) => r[c.key]).filter(Boolean).join(' · ')}
                </div>
              </div>
              <button onClick={() => toggle(r)} className={`text-xs font-mono px-3 py-1 rounded border shrink-0 ml-3 ${r.active ? 'border-[#333333] text-gray-400 hover:border-[#FF0055] hover:text-[#FF0055]' : 'border-[#00FF41] text-[#00FF41]'}`}>
                {r.active ? '停用' : '啟用'}
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
