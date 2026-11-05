// 用法：CHECK_USER=名稱 CHECK_PASSWORD=密碼 node --experimental-strip-types --env-file=.env.local scripts/check-rls.ts
// 以非會計帳號登入，確認：寫入被 RLS 擋下（42501）、讀取正常。
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

const ins = await supabase.from('fund_handlers').insert({ name: '__rls_check__' });
if (!ins.error || ins.error.code !== '42501') {
  console.error('RLS FAIL: insert should be denied with 42501, got', ins.error?.code ?? 'no error');
  process.exit(1);
}
const sel = await supabase.from('fund_transactions').select('id').limit(1);
if (sel.error) {
  console.error('RLS FAIL: select errored', sel.error.message);
  process.exit(1);
}
console.log('RLS OK');
