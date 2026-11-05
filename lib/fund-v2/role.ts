// 角色：fund_roles 查無列或任何錯誤一律視為 member（最小權限）。
// 不可在模組層級 import 瀏覽器 client 或 next/*，測試以假 client 呼叫。
import { createContext, useContext } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export type FundRole = 'accountant' | 'member';

export const loadRole = async (client: SupabaseClient): Promise<FundRole> => {
  const { data: u } = await client.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return 'member';
  const { data, error } = await client.from('fund_roles').select('role').eq('user_id', uid).maybeSingle();
  if (error) return 'member';
  return data?.role === 'accountant' ? 'accountant' : 'member';
};

/** null = 尚在載入 */
export const RoleContext = createContext<FundRole | null>(null);
export const useRole = () => useContext(RoleContext);

/** 僅開發環境：?as=member 讓會計預覽參與者畫面。production 一律回 null。 */
export const resolveRoleOverride = (search: string, env: string): 'member' | null => {
  if (env !== 'development') return null;
  return new URLSearchParams(search).get('as') === 'member' ? 'member' : null;
};
