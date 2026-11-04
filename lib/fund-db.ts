// 登入後的後台寫入：交易 + 明細 + 子表，失敗時回滾主交易（cascade 刪除子資料）
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase-client.ts';
import type { FundTransaction, FundTransactionType } from './fund.ts';

export interface NewLine { account_id: number; storage_id: number; amount: number; label?: string | null }

export interface NewTransaction {
  type: FundTransactionType;
  occurred_on: string;
  title: string;
  voucher?: string | null;
  note?: string | null;
  comment?: string | null;
  amount: number;
  seq?: number;
}

export const insertTransaction = async (
  tx: NewTransaction,
  lines: NewLine[],
  sub?: { table: string; row: Record<string, unknown> },
): Promise<{ id: number }> => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('fund_transactions')
    .insert({ ...tx, source: 'admin', created_by: user?.id ?? null })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? '寫入失敗');
  const id = data.id as number;

  const rollback = async (msg: string) => {
    await supabase.from('fund_transactions').delete().eq('id', id);
    throw new Error(msg);
  };

  const { error: lErr } = await supabase
    .from('fund_lines')
    .insert(lines.filter((l) => l.amount !== 0).map((l) => ({ ...l, transaction_id: id })));
  if (lErr) await rollback(lErr.message);

  if (sub) {
    const { error: sErr } = await supabase.from(sub.table).insert({ ...sub.row, transaction_id: id });
    if (sErr) await rollback(sErr.message);
  }
  return { id };
};

export const deleteTransaction = async (id: number) => {
  const { error } = await supabase.from('fund_transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const updateTransaction = async (
  id: number,
  patch: Partial<Pick<NewTransaction, 'occurred_on' | 'title' | 'voucher' | 'note' | 'comment' | 'amount'>>,
  singleLineAmount?: { lineId: number; amount: number },
) => {
  const { error } = await supabase.from('fund_transactions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  if (singleLineAmount) {
    const { error: lErr } = await supabase.from('fund_lines').update({ amount: singleLineAmount.amount }).eq('id', singleLineAmount.lineId);
    if (lErr) throw new Error(lErr.message);
  }
};

/** 把某筆交易的小結改成指定金額：差額以「矯正回歸」明細記入主科目與指定存放位置，後續餘額自動重算 */
export const adjustTotal = async (opts: { transactionId: number; diff: number; accountId: number; storageId: number }) => {
  if (!opts.diff) return;
  const { data: existing } = await supabase.from('fund_lines').select('id, amount')
    .eq('transaction_id', opts.transactionId).eq('storage_id', opts.storageId).eq('account_id', opts.accountId).eq('label', '矯正回歸').maybeSingle();
  if (existing) {
    const { error } = await supabase.from('fund_lines').update({ amount: Number(existing.amount) + opts.diff }).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('fund_lines').insert({ transaction_id: opts.transactionId, account_id: opts.accountId, storage_id: opts.storageId, amount: opts.diff, label: '矯正回歸' });
    if (error) throw new Error(error.message);
  }
  const { data: tx } = await supabase.from('fund_transactions').select('note').eq('id', opts.transactionId).single();
  const storageNote = `#小結矯正回歸 ${opts.diff > 0 ? '+' : ''}${opts.diff}元`;
  await supabase.from('fund_transactions').update({ note: `${tx?.note ?? ''}\n${storageNote}`.trim(), updated_at: new Date().toISOString() }).eq('id', opts.transactionId);
};


// 分批讀取全部交易（PostgREST 單次上限 1000 列）；依 occurred_on, seq, id 遞增回傳。
export const fetchAllTransactions = async (client: SupabaseClient, pageSize = 1000): Promise<FundTransaction[]> => {
  const rows: FundTransaction[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('fund_transactions')
      .select('*, fund_lines(*)')
      .order('occurred_on')
      .order('seq')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data as FundTransaction[]));
    if (data.length < pageSize) break;
  }
  return rows;
};
