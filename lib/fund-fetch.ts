// 無副作用模組：不建立任何 Supabase client，由呼叫端傳入。
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FundTransaction } from './fund.ts';

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
