// 計畫 B 讀取層。所有函式第一個參數為 client（測試可傳假 client）。
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FundAccount, FundAdvancer, FundHandler, FundMember, FundStorage, FundTag, FundTemplate,
  FundTransactionType, ClaimStatus,
} from '../fund.ts';

const num = (v: unknown) => Number(v);
const numMap = (o: Record<string, unknown> | null | undefined): Record<number, number> => {
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(o ?? {})) out[Number(k)] = Number(v);
  return out;
};
const unwrap = <T>(r: { data: T | null; error: unknown }): T => {
  if (r.error) throw r.error;
  return (r.data ?? []) as T;
};

export interface Refs {
  accounts: FundAccount[]; storages: FundStorage[]; members: FundMember[]; handlers: FundHandler[];
  advancers: FundAdvancer[]; tags: FundTag[]; templates: FundTemplate[]; settings: Record<string, unknown>;
}

export const getRefs = async (client: SupabaseClient): Promise<Refs> => {
  const [accounts, storages, members, handlers, advancers, tags, templates, settings] = await Promise.all([
    client.from('fund_accounts').select('*').order('sort_order'),
    client.from('fund_storages').select('*').order('sort_order'),
    client.from('fund_members').select('*').order('sort_order'),
    client.from('fund_handlers').select('*').order('sort_order'),
    client.from('fund_advancers').select('*').order('sort_order'),
    client.from('fund_tags').select('*').order('sort_order'),
    client.from('fund_templates').select('*').order('sort_order'),
    client.from('fund_settings').select('key, value'),
  ]);
  const st: Record<string, unknown> = {};
  for (const r of unwrap<{ key: string; value: unknown }[]>(settings)) st[r.key] = r.value;
  return {
    accounts: unwrap<FundAccount[]>(accounts), storages: unwrap<FundStorage[]>(storages),
    members: unwrap<FundMember[]>(members), handlers: unwrap<FundHandler[]>(handlers),
    advancers: unwrap<FundAdvancer[]>(advancers), tags: unwrap<FundTag[]>(tags),
    templates: unwrap<FundTemplate[]>(templates), settings: st,
  };
};

export interface Snapshot {
  transaction_id: number; ord: number; occurred_on: string;
  total: number; main: number; accounts: Record<number, number>; storages: Record<number, number>;
}

const toSnapshot = (r: any): Snapshot => ({
  transaction_id: num(r.transaction_id), ord: num(r.ord), occurred_on: r.occurred_on,
  total: num(r.total), main: num(r.main), accounts: numMap(r.accounts), storages: numMap(r.storages),
});

/** 沒有任何交易時回 null */
export const getLatestSnapshot = async (client: SupabaseClient): Promise<Snapshot | null> => {
  const { data, error } = await client.from('fund_tx_snapshots').select('*').order('ord', { ascending: false }).limit(1);
  if (error) throw error;
  return data && data[0] ? toSnapshot(data[0]) : null;
};

export interface FundPeriod {
  settlement_transaction_id: number; month: string; period_no: number;
  start_ord: number; end_ord: number; settled_on: string;
}

export const getPeriods = async (client: SupabaseClient): Promise<FundPeriod[]> => {
  const rows = unwrap<any[]>(await client.from('fund_periods').select('*').order('end_ord', { ascending: false }));
  return rows.map((r) => ({
    settlement_transaction_id: num(r.settlement_transaction_id), month: r.month, period_no: num(r.period_no),
    start_ord: num(r.start_ord), end_ord: num(r.end_ord), settled_on: r.settled_on,
  }));
};

export interface PeriodSummary {
  month: string; period_no: number; settled_on: string; end_total: number; end_main: number; min_main: number;
  income_by_source: Record<string, number>; expense_by_group: Record<string, number>; salon_income: number;
}
const strMap = (o: Record<string, unknown> | null | undefined) =>
  Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v)]));

export const getPeriodSummaries = async (client: SupabaseClient, limit = 12): Promise<PeriodSummary[]> => {
  const rows = unwrap<any[]>(await client.from('fund_period_summary').select('*')
    .order('month', { ascending: false }).order('period_no', { ascending: false }).limit(limit));
  return rows.map((r) => ({
    month: r.month, period_no: num(r.period_no), settled_on: r.settled_on,
    end_total: num(r.end_total), end_main: num(r.end_main), min_main: num(r.min_main),
    income_by_source: strMap(r.income_by_source), expense_by_group: strMap(r.expense_by_group),
    salon_income: num(r.salon_income),
  }));
};

export interface LedgerRow {
  id: number; ord: number; type: FundTransactionType; occurred_on: string; seq: number; title: string;
  voucher: string | null; note: string | null; comment: string | null; amount: number;
  stated_on: string | null; date_note: string | null; off_ledger: boolean; income_source: string | null;
  decision_ref: string | null; group_id: number | null;
  total: number; main: number; accounts: Record<number, number>; storages: Record<number, number>;
  claim_status: ClaimStatus | null; vendor: string | null; tags: string[] | null; member_id: number | null;
}

export const getLedgerRows = async (
  client: SupabaseClient, range: { fromOrd?: number; toOrd?: number } = {},
): Promise<LedgerRow[]> => {
  let q = client.from('fund_ledger_rows').select('*');
  if (range.fromOrd != null) q = q.gte('ord', range.fromOrd);
  if (range.toOrd != null) q = q.lte('ord', range.toOrd);
  const rows = unwrap<any[]>(await q.order('ord', { ascending: false }).limit(1000));
  return rows.map((r) => ({
    ...r, id: num(r.id), ord: num(r.ord), seq: num(r.seq), amount: num(r.amount),
    total: num(r.total), main: num(r.main), accounts: numMap(r.accounts), storages: numMap(r.storages),
    group_id: r.group_id == null ? null : num(r.group_id), member_id: r.member_id == null ? null : num(r.member_id),
  }));
};

export const getOpenPayables = async (client: SupabaseClient) => {
  const rows = unwrap<any[]>(await client.from('fund_payables').select('*').eq('status', 'open')
    .order('due_on', { ascending: true, nullsFirst: false }));
  return rows.map((r) => ({ ...r, id: num(r.id), amount: num(r.amount) }));
};

export interface UnclaimedExpense {
  transaction_id: number; advancer_id: number | null; vendor: string | null; tags: string[];
  occurred_on: string; stated_on: string | null; title: string; amount: number;
}

export const getUnclaimedExpenses = async (client: SupabaseClient): Promise<UnclaimedExpense[]> => {
  const rows = unwrap<any[]>(await client.from('fund_expenses')
    .select('transaction_id, advancer_id, vendor, tags, fund_transactions!inner(occurred_on, seq, stated_on, title, amount)')
    .eq('claim_status', 'unclaimed'));
  return rows
    .map((r) => {
      const t = Array.isArray(r.fund_transactions) ? r.fund_transactions[0] : r.fund_transactions;
      return {
        transaction_id: num(r.transaction_id), advancer_id: r.advancer_id == null ? null : num(r.advancer_id),
        vendor: r.vendor, tags: r.tags ?? [], occurred_on: t.occurred_on, stated_on: t.stated_on,
        title: t.title, amount: num(t.amount), seq: num(t.seq),
      };
    })
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.seq - b.seq)
    .map(({ seq: _seq, ...rest }) => rest);
};

export interface OutstandingLoan {
  loan_id: number; lender_name: string; lender_member_id: number | null;
  principal: number; repaid: number; remaining: number; status: string;
}
export const getOutstandingLoans = async (client: SupabaseClient): Promise<OutstandingLoan[]> => {
  const rows = unwrap<any[]>(await client.from('fund_outstanding_loans').select('*').order('loan_id'));
  return rows.map((r) => ({
    loan_id: num(r.loan_id), lender_name: r.lender_name, lender_member_id: r.lender_member_id,
    principal: num(r.principal), repaid: num(r.repaid), remaining: num(r.remaining), status: r.status,
  }));
};

export interface AdvanceOwed { advancer_id: number | null; advancer_name: string | null; amount: number }
export const getAdvancesOwed = async (client: SupabaseClient): Promise<AdvanceOwed[]> => {
  const rows = unwrap<any[]>(await client.from('fund_advances_owed').select('*'));
  return rows.map((r) => ({ advancer_id: r.advancer_id, advancer_name: r.advancer_name, amount: num(r.amount) }));
};

export const getWaivedTotal = async (client: SupabaseClient): Promise<number> => {
  const { data, error } = await client.from('fund_waived_total').select('total').maybeSingle();
  if (error) throw error;
  return num(data?.total ?? 0);
};
