// 標記應付為已付；不得在模組層級 import 瀏覽器 client。
import type { SupabaseClient } from '@supabase/supabase-js';

export const markPayablePaid = async (
  client: SupabaseClient, payableId: number, txId: number,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const { data, error } = await client.from('fund_payables')
    .update({ status: 'paid', paid_transaction_id: txId })
    .eq('id', payableId).eq('status', 'open').select('id');
  if (error) return { ok: false, reason: error.message };
  if (!data || data.length === 0) return { ok: false, reason: '沒有符合的未付應付（可能已被處理）' };
  return { ok: true };
};
