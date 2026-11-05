// 緊急狀態：宣告／結束的驗證與文案。函式第一個參數為 client（測試可傳假 client）。
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Emergency { id: number; started_on: string; ended_on: string | null; note: string | null }

export const getEmergencies = async (client: SupabaseClient): Promise<Emergency[]> => {
  const r = await client.from('fund_emergencies').select('id, started_on, ended_on, note').order('started_on', { ascending: false }).order('id', { ascending: false });
  if (r.error) throw r.error;
  return (r.data ?? []) as Emergency[];
};

export const openEmergency = (list: Emergency[]): Emergency | null => list.find((e) => !e.ended_on) ?? null;

type Verdict = { ok: true } | { ok: false; reason: string };

export const validateDeclare = (list: Emergency[], startedOn: string, note: string): Verdict => {
  if (openEmergency(list)) return { ok: false, reason: '已有進行中的緊急狀態，請先結束' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) return { ok: false, reason: '請選擇開始日' };
  if (!note.trim()) return { ok: false, reason: '請填寫動機與措施' };
  return { ok: true };
};

export const validateEnd = (e: Emergency, endedOn: string): Verdict => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endedOn)) return { ok: false, reason: '請選擇結束日' };
  if (endedOn < e.started_on) return { ok: false, reason: '結束日不能早於開始日' };
  return { ok: true };
};

/** YYYY-MM-DD → YYYY/M/D；格式不符原樣回傳 */
export const fmtDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}` : iso;
};

export const bannerText = (e: Emergency): string => `緊急狀態中（自 ${fmtDate(e.started_on)} 起）：${e.note ?? ''}`;
export const emergencyDecisionRef = (e: Emergency): string => `緊急狀態 ${fmtDate(e.started_on)}`;
