"use client";

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import type { FundMember } from '@/lib/fund';
import { canChange, roleErrorText, roleRows, setRole, type RoleRow } from '@/lib/fund-v2/roles';
import { Card, SectionLabel } from '../../ui';

const btnCls = 'px-3 py-2 rounded text-sm border border-[#333333] hover:border-[#00FF41] disabled:opacity-40';

export default function Roles() {
  const [rows, setRows] = useState<RoleRow[] | null>(null);
  const [selfId, setSelfId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [m, r, u] = await Promise.all([
      supabase.from('fund_members').select('id,nickname,user_id,active').order('sort_order'),
      supabase.from('fund_roles').select('user_id,role'),
      supabase.auth.getUser(),
    ]);
    if (m.error) throw m.error;
    if (r.error) throw r.error;
    setSelfId(u.data.user?.id ?? '');
    setRows(roleRows((m.data ?? []) as Pick<FundMember, 'id' | 'nickname' | 'user_id' | 'active'>[], r.data ?? []));
  }, []);
  useEffect(() => { load().catch((e) => setErr(roleErrorText(e))); }, [load]);

  const change = async (row: RoleRow, to: 'accountant' | 'member') => {
    if (!row.user_id || busy) return;
    const ok = window.confirm(to === 'accountant'
      ? `把 ${row.nickname} 設為會計？會計可以修改所有帳務資料。`
      : `把 ${row.nickname} 改為參與者？`);
    if (!ok) return;
    setBusy(true); setErr(null);
    try {
      await setRole(supabase, row.user_id, to);
      toast.success('已更新角色');
      await load();
    } catch (e) {
      setErr(roleErrorText(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-8">
      <SectionLabel>角色</SectionLabel>
      {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
      {!rows && !err && <p className="text-gray-500 text-sm">載入中...</p>}
      {rows && (
        <Card>
          {rows.map((r) => {
            const to = r.role === 'accountant' ? 'member' : 'accountant';
            const check = canChange(r, to, rows, selfId);
            return (
              <div key={r.member_id} className="py-2 border-b border-[#222222] last:border-b-0 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm">{r.nickname}　<span className={r.role === 'accountant' ? 'text-[#00FF41]' : 'text-gray-400'}>{r.role === 'accountant' ? '會計' : '參與者'}</span>{r.exited && <span className="ml-2 text-xs text-gray-500 border border-[#333333] rounded px-1">已退出</span>}</div>
                  {!check.ok && <div id={`role-why-${r.member_id}`} className="text-xs text-gray-500">{check.reason}</div>}
                </div>
                <button type="button" disabled={busy || !check.ok} onClick={() => change(r, to)}
                  aria-label={to === 'accountant' ? `把 ${r.nickname} 設為會計` : `把 ${r.nickname} 改為參與者`}
                  aria-describedby={check.ok ? undefined : `role-why-${r.member_id}`} className={btnCls}>
                  {to === 'accountant' ? '設為會計' : '改為參與者'}
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
