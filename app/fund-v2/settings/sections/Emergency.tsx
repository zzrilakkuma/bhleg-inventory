"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import {
  fmtDate, getEmergencies, openEmergency, validateDeclare, validateEnd, type Emergency as Row,
} from '@/lib/fund-v2/emergency';
import { todayISO } from '@/lib/fund';
import { Card, SectionLabel } from '../../ui';
import { EMERGENCY_CHANGED } from '../../EmergencyBanner';

const inputCls = 'bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none w-full';
const btnCls = 'px-3 py-2 rounded text-sm border border-[#333333] hover:border-[#00FF41] disabled:opacity-40';
const DUP = '已有進行中的緊急狀態，請先結束';

export default function Emergency() {
  const [list, setList] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [startedOn, setStartedOn] = useState(todayISO());
  const [endedOn, setEndedOn] = useState(todayISO());
  const [note, setNote] = useState('');
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setList(await getEmergencies(supabase)); }, []);
  useEffect(() => { load().catch((e) => setErr(String(e?.message ?? e))); }, [load]);

  const current = useMemo(() => (list ? openEmergency(list) : null), [list]);
  const history = useMemo(() => (list ?? []).filter((e) => e.ended_on), [list]);

  const afterWrite = async (done: string) => {
    toast.success(done);
    await load();
    window.dispatchEvent(new Event(EMERGENCY_CHANGED));
  };

  const declare = async () => {
    if (!list || busy) return;
    const v = validateDeclare(list, startedOn, note);
    if (!v.ok) { setFieldErr(v.reason); return; }
    setBusy(true); setFieldErr(null);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase.from('fund_emergencies')
        .insert({ started_on: startedOn, note: note.trim(), declared_by: uid });
      if (error) {
        if ((error as { code?: string }).code === '23505') { setFieldErr(DUP); await load(); window.dispatchEvent(new Event(EMERGENCY_CHANGED)); return; }
        throw error;
      }
      setNote('');
      await afterWrite('已宣告緊急狀態');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '寫入失敗');
    } finally { setBusy(false); }
  };

  const end = async () => {
    if (!current || busy) return;
    const v = validateEnd(current, endedOn);
    if (!v.ok) { setFieldErr(v.reason); return; }
    setBusy(true); setFieldErr(null);
    try {
      const { error } = await supabase.from('fund_emergencies').update({ ended_on: endedOn }).eq('id', current.id);
      if (error) throw error;
      await afterWrite('已結束緊急狀態');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '寫入失敗');
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-8">
      <SectionLabel>緊急狀態</SectionLabel>
      {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
      {!list && !err && <p className="text-gray-500 text-sm">載入中...</p>}
      {list && (
        <>
          <Card>
            {current ? (
              <div className="space-y-3">
                <p className="text-sm">自 {fmtDate(current.started_on)} 起：{current.note}</p>
                <label className="block text-sm">結束日
                  <input type="date" value={endedOn} onChange={(e) => { setEndedOn(e.target.value); setFieldErr(null); }} className={`${inputCls} mt-1`} />
                </label>
                {fieldErr && <p role="alert" className="text-[#FF0055] text-sm">{fieldErr}</p>}
                <button type="button" disabled={busy} onClick={end} className={btnCls}>結束緊急狀態</button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm">開始日
                  <input type="date" value={startedOn} onChange={(e) => { setStartedOn(e.target.value); setFieldErr(null); }} className={`${inputCls} mt-1`} />
                </label>
                <label className="block text-sm">動機與措施（必填）
                  <input value={note} onChange={(e) => { setNote(e.target.value); setFieldErr(null); }} className={`${inputCls} mt-1`} />
                </label>
                {fieldErr && <p role="alert" className="text-[#FF0055] text-sm">{fieldErr}</p>}
                <button type="button" disabled={busy} onClick={declare} className={btnCls}>宣告緊急狀態</button>
              </div>
            )}
          </Card>
          {history.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-1">歷史</div>
              <Card>
                {history.map((e) => (
                  <div key={e.id} className="py-2 border-b border-[#222222] last:border-b-0 text-sm">
                    <div className="tabular-nums text-xs text-gray-500">{fmtDate(e.started_on)} – {fmtDate(e.ended_on!)}</div>
                    <div className="text-gray-300">{e.note}</div>
                  </div>
                ))}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
