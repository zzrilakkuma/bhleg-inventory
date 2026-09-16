import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildDonationTexts, type FundAccount, type FundHandler, type FundMember, type FundStorage } from '@/lib/fund';

// 公開奉納表單的後端：不經過登入，用通關密語擋亂填，以 service role 寫入。

const adminClient = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

const passphraseOk = (given: string | null | undefined) =>
  (given ?? '').trim() === (process.env.FUND_FORM_PASSPHRASE ?? 'ppp');

export async function GET(req: NextRequest) {
  // 看到表單內容之前先驗通關密語（密語放 header，不放網址）
  if (!passphraseOk(req.headers.get('x-fund-passphrase'))) return NextResponse.json({ error: '通關密語錯誤' }, { status: 403 });

  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ error: '伺服器尚未設定 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });

  const [members, handlers, accounts] = await Promise.all([
    supabase.from('fund_members').select('id,nickname,real_name,role,default_last5,active,sort_order').eq('active', true).order('sort_order'),
    supabase.from('fund_handlers').select('id,name,active,sort_order').eq('active', true).order('sort_order'),
    supabase.from('fund_accounts').select('id,name,kind,default_storage_id,active,sort_order').eq('active', true).order('sort_order'),
  ]);
  const err = members.error ?? handlers.error ?? accounts.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  return NextResponse.json({
    members: members.data as FundMember[],
    handlers: handlers.data as FundHandler[],
    accounts: (accounts.data as FundAccount[]).filter((a) => a.kind !== 'main'),
  });
}

interface Body {
  passphrase: string;
  memberId: number;
  payerMemberId?: number | null;
  date: string;
  paymentMethod: 'transfer' | 'cash';
  last5?: string;
  handlerId?: number | null;
  amount: number;
  allocations: { accountId: number; amount: number }[];
  message?: string;
}

export async function POST(req: NextRequest) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ error: '伺服器尚未設定 SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: '格式錯誤' }, { status: 400 }); }

  if (!passphraseOk(body.passphrase)) return NextResponse.json({ error: '通關密語錯誤' }, { status: 403 });

  // ---- 驗證 ----
  const amount = Math.round(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: '金額必須是正整數' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) return NextResponse.json({ error: '日期格式錯誤' }, { status: 400 });
  if (body.date < '2024-11-01' || body.date > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) {
    return NextResponse.json({ error: '日期超出範圍' }, { status: 400 });
  }
  if (!['transfer', 'cash'].includes(body.paymentMethod)) return NextResponse.json({ error: '付款方式錯誤' }, { status: 400 });
  if (body.paymentMethod === 'transfer' && !/^\d{5}$/.test(body.last5 ?? '')) return NextResponse.json({ error: '末五碼必須是 5 位數字' }, { status: 400 });
  if (body.paymentMethod === 'cash' && !body.handlerId) return NextResponse.json({ error: '請選擇經手人' }, { status: 400 });
  // 涵蓋月份不另外填，以奉納日期所在月份為準
  const months = [body.date.slice(0, 7)];

  const allocations = (body.allocations ?? [])
    .map((a) => ({ accountId: Number(a.accountId), amount: Math.round(Number(a.amount)) }))
    .filter((a) => a.accountId && a.amount > 0);
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  if (allocated > amount) return NextResponse.json({ error: '專款分配總額超過奉納金額' }, { status: 400 });

  // ---- 查參照資料 ----
  const [memberRes, payerRes, handlerRes, accountsRes, storagesRes] = await Promise.all([
    supabase.from('fund_members').select('*').eq('id', body.memberId).single(),
    body.payerMemberId ? supabase.from('fund_members').select('*').eq('id', body.payerMemberId).single() : Promise.resolve({ data: null, error: null }),
    body.handlerId ? supabase.from('fund_handlers').select('*').eq('id', body.handlerId).single() : Promise.resolve({ data: null, error: null }),
    supabase.from('fund_accounts').select('*'),
    supabase.from('fund_storages').select('*'),
  ]);
  if (memberRes.error || !memberRes.data) return NextResponse.json({ error: '找不到成員' }, { status: 400 });
  const member = memberRes.data as FundMember;
  const payer = payerRes.data as FundMember | null;
  const handler = handlerRes.data as FundHandler | null;
  const accounts = (accountsRes.data ?? []) as FundAccount[];
  const storages = (storagesRes.data ?? []) as FundStorage[];

  const mainAccount = accounts.find((a) => a.kind === 'main');
  const postStorage = storages.find((s) => s.name === '郵局');
  const cashStorage = storages.find((s) => s.name === '現金');
  if (!mainAccount || !postStorage || !cashStorage) return NextResponse.json({ error: '科目或存放位置尚未建立' }, { status: 500 });
  const storageId = body.paymentMethod === 'transfer' ? postStorage.id : cashStorage.id;

  // ---- 組文字 ----
  const texts = buildDonationTexts({
    member, payer, months,
    paymentMethod: body.paymentMethod,
    last5: body.last5, handlerName: handler?.name,
  });

  // ---- 寫入 ----
  const { data: tx, error: txErr } = await supabase
    .from('fund_transactions')
    .insert({
      type: 'donation', occurred_on: body.date, title: texts.title, voucher: texts.voucher,
      note: texts.note, comment: body.message?.trim() || null, amount, source: 'form',
    })
    .select('id')
    .single();
  if (txErr || !tx) return NextResponse.json({ error: txErr?.message ?? '寫入失敗' }, { status: 500 });

  const lines = [
    { transaction_id: tx.id, account_id: mainAccount.id, storage_id: storageId, amount: amount - allocated, label: null as string | null },
    ...allocations.map((a) => {
      const acc = accounts.find((x) => x.id === a.accountId);
      return { transaction_id: tx.id, account_id: a.accountId, storage_id: storageId, amount: a.amount, label: acc?.name ?? null };
    }),
  ].filter((l) => l.amount !== 0);

  const [linesRes, donationRes] = await Promise.all([
    supabase.from('fund_lines').insert(lines),
    supabase.from('fund_donations').insert({
      transaction_id: tx.id, member_id: member.id, payer_member_id: payer?.id ?? null,
      payment_method: body.paymentMethod, last5: body.paymentMethod === 'transfer' ? body.last5 : null,
      handler_id: body.paymentMethod === 'cash' ? handler?.id ?? null : null,
      months, message: body.message?.trim() || null,
    }),
  ]);
  const writeErr = linesRes.error ?? donationRes.error;
  if (writeErr) {
    await supabase.from('fund_transactions').delete().eq('id', tx.id);
    return NextResponse.json({ error: writeErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: tx.id, title: texts.title });
}
