"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { getRefs } from '@/lib/fund-v2/api';
import { parseSettings } from '@/lib/fund-v2/settings';
import {
  buildExitPatch, buildRejoinPatch, exitNoticeWarning, validateMembership,
} from '@/lib/fund-v2/membership';
import { memberDisplayName, todayISO, type FundMember } from '@/lib/fund';
import { Card, SectionLabel, Sheet } from '../../ui';

const inputCls = 'bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none w-full';
const btnCls = 'px-3 py-2 rounded text-sm border border-[#333333] hover:border-[#00FF41]';
type Mode = 'view' | 'exit';

export default function Members() {
  const [members, setMembers] = useState<FundMember[] | null>(null);
  const [noticeDays, setNoticeDays] = useState(5);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [joined, setJoined] = useState('');
  const [leftOn, setLeftOn] = useState('');
  const [note, setNote] = useState('');
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [accountants, setAccountants] = useState<Set<string>>(new Set());

  // 只用來提醒：退出的會計仍保有 fund_roles 寫入權限，要另到「角色」降級
  useEffect(() => {
    supabase.from('fund_roles').select('user_id, role').eq('role', 'accountant')
      .then((r) => { if (!r.error) setAccountants(new Set((r.data ?? []).map((x: { user_id: string }) => x.user_id))); });
  }, []);

  const load = useCallback(async () => {
    const refs = await getRefs(supabase);
    setMembers(refs.members);
    setNoticeDays(parseSettings(refs.settings).exit_notice_days);
  }, []);
  useEffect(() => { load().catch((e) => setErr(String(e?.message ?? e))); }, [load]);

  const sorted = useMemo(() => {
    if (!members) return [];
    const left = (m: FundMember) => (m.left_at != null || !m.active ? 1 : 0);
    return [...members].sort((a, b) => left(a) - left(b) || a.sort_order - b.sort_order);
  }, [members]);
  const missingJoined = useMemo(
    () => (members ?? []).filter((m) => m.active && !m.left_at && !m.joined_at).length, [members]);
  const current = members?.find((m) => m.id === openId) ?? null;
  const isOut = (m: FundMember) => !m.active || m.left_at != null;

  const open = (m: FundMember) => {
    setOpenId(m.id); setMode('view'); setFieldErr(null);
    setJoined(isOut(m) ? todayISO() : m.joined_at ?? ''); setLeftOn(todayISO()); setNote('');
  };
  const close = () => { setOpenId(null); setFieldErr(null); };

  const write = async (id: number, patch: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('fund_members').update(patch).eq('id', id);
      if (error) throw error;
      toast.success(done);
      close();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '寫入失敗');
    } finally {
      setBusy(false);
    }
  };

  const saveJoined = () => {
    if (!current) return;
    const v = validateMembership(joined, current.left_at ?? '');
    if (!v.ok) { setFieldErr(v.reason); return; }
    write(current.id, { joined_at: joined || null }, '已更新');
  };
  const confirmExit = () => {
    if (!current) return;
    if (!leftOn) { setFieldErr('請填退出日'); return; }
    const v = validateMembership(current.joined_at ?? '', leftOn);
    if (!v.ok) { setFieldErr(v.reason); return; }
    write(current.id, buildExitPatch(leftOn, note), '已退出');
  };
  const rejoin = () => {
    if (!current) return;
    if (!joined) { setFieldErr('請填加入日'); return; }
    write(current.id, buildRejoinPatch(joined), '已重新加入');
  };

  const warning = mode === 'exit' && leftOn ? exitNoticeWarning(leftOn, todayISO(), noticeDays) : null;

  return (
    <div>
      <SectionLabel>成員</SectionLabel>
      {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
      {!members && !err && <p className="text-gray-500 text-sm">載入中...</p>}
      {members && (
        <>
          {missingJoined > 0 && (
            <p className="text-sm text-amber-400 mb-2">{missingJoined} 位成員尚未填加入日</p>
          )}
          <Card>
            {sorted.map((m) => (
              <button key={m.id} type="button" onClick={() => open(m)}
                className={`w-full text-left py-3 border-b border-[#222222] last:border-b-0 flex items-center justify-between gap-3 ${isOut(m) ? 'text-gray-500' : ''}`}>
                <span className="text-sm">{memberDisplayName(m)}</span>
                <span className="text-xs tabular-nums text-gray-500 text-right">
                  加入 {m.joined_at ?? '—'}{m.left_at ? `／退出 ${m.left_at}` : ''}
                </span>
              </button>
            ))}
          </Card>
        </>
      )}
      <Sheet open={!!current} onClose={close} title={current ? memberDisplayName(current) : undefined}>
        {current && (
          <div className="space-y-3">
            {current.exit_note && <p className="text-sm text-gray-400">退出說明：{current.exit_note}</p>}
            {isOut(current) ? (
              <>
                <label className="block text-sm">加入日
                  <input type="date" value={joined} onChange={(e) => { setJoined(e.target.value); setFieldErr(null); }} className={`${inputCls} mt-1`} />
                </label>
                {fieldErr && <p role="alert" className="text-[#FF0055] text-sm">{fieldErr}</p>}
                <button type="button" disabled={busy} onClick={rejoin} className={btnCls}>重新加入</button>
              </>
            ) : mode === 'view' ? (
              <>
                <label className="block text-sm">加入日
                  <input type="date" value={joined} onChange={(e) => { setJoined(e.target.value); setFieldErr(null); }} className={`${inputCls} mt-1`} />
                </label>
                {fieldErr && <p role="alert" className="text-[#FF0055] text-sm">{fieldErr}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={saveJoined} className={btnCls}>存加入日</button>
                  <button type="button" onClick={() => { setMode('exit'); setFieldErr(null); }} className={btnCls}>退出</button>
                </div>
              </>
            ) : (
              <>
                <label className="block text-sm">退出日
                  <input type="date" value={leftOn} onChange={(e) => { setLeftOn(e.target.value); setFieldErr(null); }} className={`${inputCls} mt-1`} />
                </label>
                <label className="block text-sm">退出說明
                  <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-1`} />
                </label>
                {warning && <p className="text-sm text-amber-400">{warning}</p>}
                {current.user_id && accountants.has(current.user_id) && <p className="text-sm text-amber-400">這位成員是會計，退出後請到「角色」改為參與者</p>}
                {fieldErr && <p role="alert" className="text-[#FF0055] text-sm">{fieldErr}</p>}
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={confirmExit} className={btnCls}>確定退出</button>
                  <button type="button" onClick={() => { setMode('view'); setFieldErr(null); }} className={btnCls}>返回</button>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
