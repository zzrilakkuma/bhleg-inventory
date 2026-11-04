// 以前端演算法（computeRunningBalances）逐列比對 fund_tx_snapshots view。
// 用法：node --experimental-strip-types --env-file=.env.local scripts/verify-views.ts
import { createClient } from '@supabase/supabase-js';
import { computeRunningBalances } from '../lib/fund.ts';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// 分頁讀取全部列（PostgREST 預設上限 1000）。Task 5 的 fetchAllTransactions 完成後可替換此 helper。
const fetchAll = async (table: string, select: string, orderCols: string[]): Promise<any[]> => {
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = s.from(table).select(select);
    for (const c of orderCols) q = q.order(c, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
};

const norm = (o: Record<string, unknown> | null | undefined): Record<number, number> => {
  const r: Record<number, number> = {};
  for (const [k, v] of Object.entries(o ?? {})) {
    const n = Number(v);
    if (n !== 0) r[Number(k)] = n;
  }
  return r;
};
const sameMap = (a: Record<number, number>, b: Record<number, number>) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[Number(k)] === b[Number(k)]);
};

const main = async () => {
  const txs = await fetchAll('fund_transactions', '*, fund_lines(*)', ['occurred_on', 'seq', 'id']);
  const snaps = await fetchAll('fund_tx_snapshots', '*', ['ord']);
  const { data: mainAcc, error } = await s.from('fund_accounts').select('id').eq('kind', 'main').limit(1).single();
  if (error) throw error;
  const mainId = mainAcc.id as number;

  if (txs.length !== snaps.length) {
    console.error(`列數不符：transactions=${txs.length} snapshots=${snaps.length}`);
    process.exit(1);
  }

  const { ordered, snapshots } = computeRunningBalances(txs);
  for (let i = 0; i < snaps.length; i++) {
    const v = snaps[i];
    const id = v.transaction_id;
    const f = snapshots.get(id);
    const fe = {
      total: f?.total ?? NaN,
      main: f?.accounts[mainId] ?? 0,
      accounts: norm(f?.accounts),
      storages: norm(f?.storages),
    };
    const ve = {
      total: Number(v.total),
      main: Number(v.main),
      accounts: norm(v.accounts),
      storages: norm(v.storages),
    };
    const ok = !!f && ordered[i]?.id === id && fe.total === ve.total && fe.main === ve.main
      && sameMap(fe.accounts, ve.accounts) && sameMap(fe.storages, ve.storages);
    if (!ok) {
      console.error(`MISMATCH transaction_id=${id} (ord ${v.ord})`);
      console.error('frontend:', JSON.stringify(fe));
      console.error('view:    ', JSON.stringify(ve));
      process.exit(1);
    }
  }
  console.log(`VIEWS OK ${snaps.length} transactions`);
};

main().catch((e) => { console.error(e); process.exit(1); });
