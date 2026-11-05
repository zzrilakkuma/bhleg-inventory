"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { todayISO } from '@/lib/fund';
import { getRefs, type Refs } from '@/lib/fund-v2/api';
import { useRole } from '@/lib/fund-v2/role';
import { Amount, Card, Chip, SectionLabel } from '../ui';

interface Payable {
  id: number; title: string; amount: number; due_on: string | null; vendor: string | null;
  status: 'open' | 'paid' | 'cancelled'; template_id: number | null;
}
const inputCls = 'w-full bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none';

export default function PayablesPage() {
  const role = useRole();
  const router = useRouter();
  const isAcc = role === 'accountant';
  const [rows, setRows] = useState<Payable[] | null>(null);
  const [refs, setRefs] = useState<Refs | null>(null);
  const [history, setHistory] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState(''); const [vendor, setVendor] = useState('');
  const [tplId, setTplId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('fund_payables').select('*')
      .order('due_on', { ascending: true, nullsFirst: false });
    if (error) { toast.error(error.message); setRows([]); return; }
    setRows((data ?? []).map((r: any) => ({ ...r, id: Number(r.id), amount: Number(r.amount) })));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAcc && !refs) getRefs(supabase).then(setRefs).catch(() => {}); }, [isAcc, refs]);

  const recurring = (refs?.templates ?? []).filter((t) => t.recurring && t.active);
  const pickTemplate = (id: number) => {
    setTplId(id);
    const t = recurring.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.name); setVendor(t.vendor ?? '');
    if (t.default_amount != null) setAmount(String(t.default_amount));
  };

  const add = async () => {
    if (busy || !title.trim() || !(Number(amount) > 0)) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from('fund_payables').insert({
        title: title.trim(), amount: Number(amount), due_on: dueOn || null, vendor: vendor.trim() || null,
        template_id: tplId, status: 'open', note: null, created_by: u?.user?.id ?? null,
      });
      if (error) throw error;
      toast.success('已新增');
      setTitle(''); setAmount(''); setDueOn(''); setVendor(''); setTplId(null); setAdding(false);
      load();
    } catch (e: any) { toast.error(e?.message ?? '新增失敗'); } finally { setBusy(false); }
  };

  const cancel = async (id: number) => {
    if (!confirm('取消這筆應付？')) return;
    const { error } = await supabase.from('fund_payables').update({ status: 'cancelled' }).eq('id', id);
    if (error) toast.error(error.message); else load();
  };

  if (!rows) return <div className="text-gray-500 text-sm">載入中...</div>;
  const today = todayISO();
  const shown = rows.filter((r) => (history ? r.status !== 'open' : r.status === 'open'));

  return (
    <div className="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">應付</h1>
        <div className="flex gap-2">
          <Chip on={history} onClick={() => setHistory((h) => !h)}>已付／取消</Chip>
          {isAcc && <Chip on={adding} onClick={() => setAdding((a) => !a)}>新增</Chip>}
        </div>
      </div>

      {isAcc && adding && (
        <Card className="mb-4">
          {recurring.length > 0 && (
            <>
              <SectionLabel>從固定項目帶入（可略）</SectionLabel>
              <select value={tplId ?? ''} onChange={(e) => e.target.value && pickTemplate(Number(e.target.value))} className={inputCls}>
                <option value="">—</option>
                {recurring.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
          <SectionLabel>名稱</SectionLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          <SectionLabel>金額</SectionLabel>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} className={`${inputCls} tabular-nums`} />
          <SectionLabel>到期日</SectionLabel>
          <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={inputCls} />
          <SectionLabel>對象</SectionLabel>
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls} />
          <button type="button" disabled={busy || !title.trim() || !(Number(amount) > 0)} onClick={add}
            className="w-full mt-4 py-3 rounded border border-[#00FF41] text-[#00FF41] disabled:opacity-40">
            {busy ? '寫入中...' : '新增應付'}
          </button>
        </Card>
      )}

      {shown.length === 0 && <div className="text-sm text-gray-500">{history ? '沒有已付或取消的紀錄' : '沒有未付的應付'}</div>}
      <ul className="space-y-2">
        {shown.map((p) => {
          const late = p.status === 'open' && !!p.due_on && p.due_on < today;
          return (
            <li key={p.id}>
              <Card>
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="text-white">{p.title}</div>
                    <div className={`text-xs mt-1 ${late ? 'text-[#FF0055]' : 'text-gray-500'}`}>
                      {[p.vendor, p.due_on ? `到期 ${p.due_on}${late ? '（逾期）' : ''}` : null, p.status === 'paid' ? '已付' : p.status === 'cancelled' ? '已取消' : null].filter(Boolean).join('・')}
                    </div>
                  </div>
                  <Amount value={p.amount} />
                </div>
                {isAcc && p.status === 'open' && (
                  <div className="flex gap-2 mt-3">
                    <Chip onClick={() => router.push(`/fund-v2/record?payable=${p.id}`)}>標記已付</Chip>
                    <Chip onClick={() => cancel(p.id)}>取消</Chip>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
