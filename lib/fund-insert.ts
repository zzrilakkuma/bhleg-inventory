// 交易 + 明細 + 子表的三段式寫入（無副作用，client 由呼叫端傳入；失敗時回滾主交易）
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewLine, NewTransaction } from './fund-db.ts';

export const insertTransactionWith = async (
  client: SupabaseClient,
  tx: NewTransaction,
  lines: NewLine[],
  sub?: { table: string; row: Record<string, unknown> },
): Promise<{ id: number }> => {
  const { data: { user } } = await client.auth.getUser();
  const { data, error } = await client
    .from('fund_transactions')
    .insert({ ...tx, source: 'admin', created_by: user?.id ?? null })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? '寫入失敗');
  const id = data.id as number;

  const rollback = async (msg: string) => {
    await client.from('fund_transactions').delete().eq('id', id);
    throw new Error(msg);
  };

  // 沒有非零明細（例：凍存 0/0 且核對相符的結算）就不送空的 insert
  const rows = lines.filter((l) => l.amount !== 0).map((l) => ({ ...l, transaction_id: id }));
  if (rows.length) {
    const { error: lErr } = await client.from('fund_lines').insert(rows);
    if (lErr) await rollback(lErr.message);
  }

  if (sub) {
    const { error: sErr } = await client.from(sub.table).insert({ ...sub.row, transaction_id: id });
    if (sErr) await rollback(sErr.message);
  }
  return { id };
};
