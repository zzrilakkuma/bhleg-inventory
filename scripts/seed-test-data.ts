// 建立一組標記為【測試資料】的流水帳，涵蓋所有交易類型。
// 用法：node --experimental-strip-types --env-file=.env.local scripts/seed-test-data.ts
// 清除：node --experimental-strip-types --env-file=.env.local scripts/seed-test-data.ts --wipe
import { createClient } from '@supabase/supabase-js';
import {
  buildDonationTexts, buildExpenseTexts, buildAdvanceSettleTexts, buildLoanTexts, buildRepaymentTexts,
  buildTransferTexts, buildOtherIncomeTexts, buildSettlementTexts, FREEZE_RATE,
} from '../lib/fund.ts';

const TAG = '【測試資料】';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const wipe = async () => {
  const { data, error } = await s.from('fund_transactions').delete().eq('comment', TAG).select('id');
  if (error) throw error;
  console.log(`已刪除 ${data.length} 筆測試資料`);
};

const main = async () => {
  if (process.argv.includes('--wipe')) return wipe();
  const [ac, st, mb, hd, ad] = await Promise.all([
    s.from('fund_accounts').select('*'), s.from('fund_storages').select('*'), s.from('fund_members').select('*'),
    s.from('fund_handlers').select('*'), s.from('fund_advancers').select('*'),
  ]);
  const acc = (n: string) => ac.data!.find((a) => a.name === n)!;
  const sto = (n: string) => st.data!.find((a) => a.name === n)!;
  const mem = (n: string) => mb.data!.find((a) => a.nickname === n)!;
  const main = acc('不凍結零用金'), post = sto('郵局'), cash = sto('現金'), adv = sto('代墊（待清償）');
  const handler = hd.data!.find((h) => h.name === '艾摩爾')!;
  const card = ad.data!.find((a) => a.name === '信用卡')!, lanshi = ad.data!.find((a) => a.name === '中央蘭室')!;

  let seq = 0;
  const insert = async (tx: Record<string, unknown>, lines: { account_id: number; storage_id: number; amount: number; label?: string }[], sub?: { table: string; row: Record<string, unknown> }) => {
    const { data, error } = await s.from('fund_transactions').insert({ ...tx, seq: seq++, source: 'admin', comment: TAG }).select('id').single();
    if (error) throw error;
    const l = await s.from('fund_lines').insert(lines.filter((x) => x.amount !== 0).map((x) => ({ ...x, transaction_id: data.id })));
    if (l.error) throw l.error;
    if (sub) { const r = await s.from(sub.table).insert({ ...sub.row, transaction_id: data.id }); if (r.error) throw r.error; }
    console.log(`#${data.id} ${tx.type} ${tx.occurred_on} ${tx.amount}  ${String(tx.title).split('\n')[0]}`);
    return data.id as number;
  };

  // 1. 初始金額
  await insert({ type: 'opening', occurred_on: '2026-08-01', title: '***測試 初始金額***', voucher: '#郵局帳戶\n#現金袋', note: '#帳戶初始金額', amount: 10631 },
    [{ account_id: main.id, storage_id: post.id, amount: 9800 }, { account_id: main.id, storage_id: cash.id, amount: 831 }]);

  // 2. 奉納
  const donate = async (nick: string, date: string, amount: number, method: 'transfer' | 'cash', alloc?: { account: string; amount: number }) => {
    const m = mem(nick);
    const t = buildDonationTexts({ member: m, months: [date.slice(0, 7)], paymentMethod: method, last5: m.default_last5, handlerName: handler.name });
    const storage = method === 'transfer' ? post : cash;
    const lines = [{ account_id: main.id, storage_id: storage.id, amount: amount - (alloc?.amount ?? 0) }];
    if (alloc) lines.push({ account_id: acc(alloc.account).id, storage_id: storage.id, amount: alloc.amount, label: alloc.account } as never);
    await insert({ type: 'donation', occurred_on: date, ...t, amount }, lines, {
      table: 'fund_donations', row: { member_id: m.id, payment_method: method, last5: method === 'transfer' ? m.default_last5 : null, handler_id: method === 'cash' ? handler.id : null, months: [date.slice(0, 7)] },
    });
  };
  await donate('嚴昕', '2026-08-05', 1500, 'transfer');
  await donate('Ryan', '2026-08-08', 800, 'cash');
  await donate('Lucy', '2026-08-14', 3000, 'cash', { account: '小組專款（廚房）', amount: 1000 });
  await donate('阿繁', '2026-08-04', 1000, 'transfer');

  // 3. 支出
  const expense = async (date: string, vendor: string, description: string, amount: number, storageName: string, tags: string[], voucherNo = '', advancer?: { id: number; name: string }) => {
    const t = buildExpenseTexts({ vendor, description, voucherNo, tags, storageName, accountName: main.name, advancerName: advancer?.name });
    const line = advancer ? { account_id: main.id, storage_id: adv.id, amount: -amount, label: advancer.name } : { account_id: main.id, storage_id: sto(storageName).id, amount: -amount };
    await insert({ type: 'expense', occurred_on: date, ...t, amount: -amount }, [line], {
      table: 'fund_expenses', row: { vendor, description, voucher_no: voucherNo || null, tags, advancer_id: advancer?.id ?? null },
    });
  };
  await expense('2026-08-03', '全聯福利中心', '咖啡豆、衛生紙、羊奶', 536, '現金', ['巢穴', '耗品', '咖啡豆'], 'WV-51039832');
  await expense('2026-08-06', '台灣電力公司', '巢穴 7月份 電費', 6492, '郵局', ['巢穴', '經常性基本開銷', '電費']);
  await expense('2026-08-11', '家樂福', '狗乾糧', 499, '現金', ['巢穴', '非人動物成員', '狗飼料'], '', card);
  await expense('2026-08-12', '文新瓦斯行', '瓦斯', 660, '現金', ['共享廚房', '瓦斯'], '', lanshi);

  // 4. 轉帳 郵局→現金袋
  const tr = buildTransferTexts({ fromName: post.name, toName: cash.name, amount: 3000 });
  await insert({ type: 'transfer', occurred_on: '2026-08-10', ...tr, amount: 0 },
    [{ account_id: main.id, storage_id: post.id, amount: -3000 }, { account_id: main.id, storage_id: cash.id, amount: 3000 }]);

  // 5. 借款
  const lt = buildLoanTexts({ lender: '巢穴人 嚴昕', storageName: post.name });
  const loanTx = await insert({ type: 'loan', occurred_on: '2026-08-15', ...lt, amount: 20000 }, [{ account_id: main.id, storage_id: post.id, amount: 20000 }],
    { table: 'fund_loans', row: { lender_name: '巢穴人 嚴昕', principal: 20000 } });
  const { data: loan } = await s.from('fund_loans').select('id').eq('transaction_id', loanTx).single();

  // 6. 還款
  const rt = buildRepaymentTexts({ lender: '巢穴人 嚴昕', storageName: post.name, fee: 12 });
  await insert({ type: 'repayment', occurred_on: '2026-08-20', ...rt, amount: -1712 },
    [{ account_id: main.id, storage_id: post.id, amount: -1700 }, { account_id: main.id, storage_id: post.id, amount: -12, label: '手續費' }],
    { table: 'fund_repayments', row: { loan_id: loan!.id, amount: 1700, fee: 12 } });

  // 7. 清償信用卡代墊
  const at = buildAdvanceSettleTexts({ advancerName: '信用卡', storageName: cash.name, amount: 499 });
  await insert({ type: 'transfer', occurred_on: '2026-08-25', ...at, amount: 0 },
    [{ account_id: main.id, storage_id: cash.id, amount: -499 }, { account_id: main.id, storage_id: adv.id, amount: 499, label: '信用卡' }]);

  // 8. 其他收入與回注
  const it = buildOtherIncomeTexts({ source: '巢穴思想沙龍', description: '8月 營業收入', storageName: cash.name, accountName: main.name, refund: false });
  await insert({ type: 'income', occurred_on: '2026-08-28', ...it, amount: 25050 }, [{ account_id: main.id, storage_id: cash.id, amount: 25050 }]);
  const ft = buildOtherIncomeTexts({ source: '中央蘭室', description: '8月蘭室專款 未用盡之餘款回注', storageName: cash.name, accountName: main.name, refund: true });
  await insert({ type: 'refund', occurred_on: '2026-08-31', ...ft, amount: 3000 }, [{ account_id: main.id, storage_id: cash.id, amount: 3000 }]);

  // 9. 8月結算
  const { data: all } = await s.from('fund_lines').select('account_id,amount,storage_id');
  const remaining = all!.filter((l) => l.account_id === main.id).reduce((a, l) => a + Number(l.amount), 0);
  const postBal = all!.filter((l) => l.storage_id === post.id).reduce((a, l) => a + Number(l.amount), 0);
  const cashBal = all!.filter((l) => l.storage_id === cash.id).reduce((a, l) => a + Number(l.amount), 0);
  const f = Math.floor(remaining * FREEZE_RATE);
  const stt = buildSettlementTexts({ month: '2026-08', remaining, freezeReserve: f, freezeFuture: f, repayments: [{ lender: '巢穴人 嚴昕', amount: 1700, fee: 12, remaining: 18300 }], leftover: remaining - 2 * f, extraNote: '' });
  await insert({ type: 'settlement', occurred_on: '2026-09-03', ...stt, amount: 0 }, [
    { account_id: main.id, storage_id: post.id, amount: -f }, { account_id: acc('緊急應變備用金').id, storage_id: post.id, amount: f, label: '凍存' },
    { account_id: main.id, storage_id: post.id, amount: -f }, { account_id: acc('共存前瞻預算').id, storage_id: post.id, amount: f, label: '凍存' },
  ], { table: 'fund_settlements', row: { month: '2026-08', actual_post: postBal, actual_cash: cashBal - 20, system_post: postBal, system_cash: cashBal } });

  // 9月幾筆奉納，讓每月一覽有兩個月
  await donate('嚴昕', '2026-09-05', 700, 'transfer');
  await donate('Steven', '2026-09-10', 1500, 'transfer');
  console.log('完成');
};
main().catch((e) => { console.error(e); process.exit(1); });
