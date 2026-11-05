// 用法：CHECK_USER=名稱 CHECK_PASSWORD=密碼 node --experimental-strip-types --env-file=.env.local scripts/check-rls.ts
// 以非會計帳號登入，確認：6 項寫入被 RLS 擋下（42501 或 0 列）、4 項讀取正常。
// 所有寫入嘗試皆無害：寫回現值、或萬一成功會立刻刪除自己建立的列。
import { createClient } from '@supabase/supabase-js';

const user = process.env.CHECK_USER;
const password = process.env.CHECK_PASSWORD;
if (!user || !password) {
  console.log('RLS SKIPPED (no CHECK_USER)');
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon, { auth: { persistSession: false } });

const res = await supabase.functions.invoke('login-with-name', {
  body: { action: 'login', name: user, safeWord: password },
  headers: { Authorization: `Bearer ${anon}` },
});
if (res.error || res.data?.error) {
  console.error('RLS FAIL: login failed');
  process.exit(1);
}
const { error: sessErr } = await supabase.auth.setSession({
  access_token: res.data.session.access_token,
  refresh_token: res.data.session.refresh_token,
});
if (sessErr) {
  console.error('RLS FAIL: setSession', sessErr.message);
  process.exit(1);
}

let checks = 0;
const fail = (table: string, action: string, detail?: string): never => {
  console.error(`RLS FAIL: ${table} ${action}${detail ? ` (${detail})` : ''}`);
  process.exit(1);
};
type Res = { error: { code?: string; message?: string } | null; data: unknown[] | null };

// 被拒：error.code 為 42501，或沒有 error 且 data 為空陣列。data 為 null 視為失敗。
// 若成功（有列）則先清除再失敗；清除失敗時先印 RLS CLEANUP FAILED。
async function expectDenied(table: string, action: string, run: () => PromiseLike<Res>, cleanup?: () => PromiseLike<{ error: unknown }>) {
  const r = await run();
  if (r.error) {
    if (r.error.code !== '42501') fail(table, action, `code ${r.error.code ?? 'unknown'}`);
  } else if (!Array.isArray(r.data) || r.data.length > 0) {
    if (cleanup) {
      const c = await cleanup().then((x) => x, () => ({ error: true }));
      if (c.error) console.error(`RLS CLEANUP FAILED: ${table}`);
    }
    fail(table, action, Array.isArray(r.data) ? 'unexpectedly succeeded' : 'no data');
  }
  checks++;
}
// requireRows=false 僅用於 fund_emergencies：平常 0 列，空結果是正常的，只能檢查沒有 error。
async function expectReadable(table: string, requireRows: boolean) {
  const r = await supabase.from(table).select('*').limit(1);
  if (r.error) fail(table, 'select', r.error.code ?? 'error');
  if (requireRows && (!r.data || r.data.length === 0)) fail(table, 'read', 'no rows');
  checks++;
}

const me = await supabase.auth.getUser();
const uid = me.data.user?.id;
if (me.error || !uid) fail('auth', 'getUser');

// 先讀現值，寫入時寫回同一個值
const cap = await supabase.from('fund_settings').select('value').eq('key', 'monthly_cap').maybeSingle();
if (cap.error || !cap.data) fail('fund_settings', 'select', 'monthly_cap');
const member = await supabase.from('fund_members').select('id,left_at').limit(1).maybeSingle();
if (member.error || !member.data) fail('fund_members', 'select');
const tx = await supabase.from('fund_transactions').select('id,comment').limit(1).maybeSingle();
if (tx.error || !tx.data) fail('fund_transactions', 'select');

await expectDenied('fund_settings', 'update', () =>
  supabase.from('fund_settings').update({ value: cap.data!.value }).eq('key', 'monthly_cap').select('key'));

await expectDenied('fund_roles', 'insert',
  () => supabase.from('fund_roles').insert({ user_id: uid, role: 'accountant' }).select('user_id'),
  () => supabase.from('fund_roles').delete().eq('user_id', uid!).eq('role', 'accountant'));

await expectDenied('fund_members', 'update', () =>
  supabase.from('fund_members').update({ left_at: member.data!.left_at }).eq('id', member.data!.id).select('id'));

await expectDenied('fund_emergencies', 'insert',
  () => supabase.from('fund_emergencies').insert({ started_on: '2000-01-01', note: '__rls_check__' }).select('id'),
  () => supabase.from('fund_emergencies').delete().eq('note', '__rls_check__'));

await expectDenied('fund_payables', 'insert',
  () => supabase.from('fund_payables').insert({ title: '__rls_check__', amount: 0 }).select('id'),
  () => supabase.from('fund_payables').delete().eq('title', '__rls_check__'));

await expectDenied('fund_transactions', 'update', () =>
  supabase.from('fund_transactions').update({ comment: tx.data!.comment }).eq('id', tx.data!.id).select('id'));

await expectReadable('fund_settings', true);
await expectReadable('fund_emergencies', false);
await expectReadable('fund_donations', true);
await expectReadable('fund_tx_snapshots', true);

console.log(`RLS OK (${checks} checks)`);
