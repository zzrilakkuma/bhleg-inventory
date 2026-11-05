"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase-client';
import { getRefs } from '@/lib/fund-v2/api';
import {
  charterDiffs, formatSetting, parseSettings, saveSetting, SETTING_META, validateSetting,
  type FundSettings, type SettingKey,
} from '@/lib/fund-v2/settings';
import { Card, Chip, SectionLabel } from '../../ui';

const KEYS: SettingKey[] = [
  'donation_due_day', 'settlement_due_day', 'group_settle_due_day', 'exit_notice_days',
  'monthly_cap', 'standard_amount', 'freeze_rate', 'freeze_base',
];
const inputCls = 'bg-black border border-[#333333] rounded px-3 py-2 text-white text-base focus:border-[#00FF41] outline-none w-28 tabular-nums';
const btnCls = 'px-3 py-2 rounded text-sm border border-[#333333] hover:border-[#00FF41]';

export default function Rules() {
  const [settings, setSettings] = useState<FundSettings | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<SettingKey | null>(null);
  const [draft, setDraft] = useState('');
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const refs = await getRefs(supabase);
    setSettings(parseSettings(refs.settings));
  }, []);
  useEffect(() => { load().catch((e) => setErr(String(e?.message ?? e))); }, [load]);

  const diffs = useMemo(() => (settings ? charterDiffs(settings) : []), [settings]);

  const startEdit = (key: SettingKey) => {
    if (!settings) return;
    setEditing(key); setDraft(String(settings[key])); setFieldErr(null);
  };
  const cancel = () => { setEditing(null); setFieldErr(null); };

  const save = async (key: SettingKey, input: string) => {
    const r = validateSetting(key, input);
    if (!r.ok) { setFieldErr(r.reason); return; }
    setBusy(true);
    try {
      await saveSetting(supabase, key, r.value);
      toast.success('已更新');
      setEditing(null); setFieldErr(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '寫入失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionLabel>規則</SectionLabel>
      {err && <p role="alert" className="text-[#FF0055] text-sm mb-3">{err}</p>}
      {!settings && !err && <p className="text-gray-500 text-sm">載入中...</p>}
      {settings && (
        <>
          {diffs.length > 0 && (
            <div className="border border-[#333333] bg-white/5 rounded p-3 mb-3 text-sm text-gray-400">
              <p className="mb-1">以下與章程條文不同（只提醒，不影響記帳）</p>
              <ul>
                {diffs.map((d) => <li key={d.key}>{d.label}：章程 {d.charter}／目前 {d.current}</li>)}
              </ul>
            </div>
          )}
          <Card>
            {KEYS.map((key) => {
              const meta = SETTING_META[key];
              const isEditing = editing === key;
              return (
                <div key={key} className="py-3 border-b border-[#222222] last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">{meta.label}</div>
                    {!isEditing && (
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums">{formatSetting(key, settings[key])}</span>
                        <button type="button" onClick={() => startEdit(key)} aria-label={`修改${meta.label}`} className={btnCls}>改</button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{meta.hint}</p>
                  {isEditing && (
                    <div className="mt-2">
                      {key === 'freeze_base' ? (
                        <div className="flex gap-2 items-center">
                          <Chip on={settings.freeze_base === 'main'} onClick={() => !busy && save(key, 'main')}>不凍結零用金</Chip>
                          <Chip on={settings.freeze_base === 'total'} onClick={() => !busy && save(key, 'total')}>總餘款</Chip>
                          <button type="button" onClick={cancel} className={btnCls}>取消</button>
                        </div>
                      ) : (
                        <div className="flex gap-2 items-center">
                          <input value={draft} inputMode="decimal" aria-label={meta.label} aria-invalid={!!fieldErr}
                            onChange={(e) => { setDraft(e.target.value); setFieldErr(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) save(key, draft); }}
                            className={inputCls} autoFocus />
                          {meta.unit && <span className="text-sm text-gray-500">{meta.unit}</span>}
                          <button type="button" disabled={busy} onClick={() => save(key, draft)} className={btnCls}>存</button>
                          <button type="button" onClick={cancel} className={btnCls}>取消</button>
                        </div>
                      )}
                      {fieldErr && <p role="alert" className="text-[#FF0055] text-sm mt-2">{fieldErr}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}
