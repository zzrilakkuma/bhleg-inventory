// 登入後的後台寫入：交易 + 明細 + 子表，失敗時回滾主交易（cascade 刪除子資料）
import { supabase } from '@/lib/supabase-client';
import type { FundTransactionType } from '@/lib/fund';

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
