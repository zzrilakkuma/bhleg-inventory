// 角色管理：成員與 fund_roles 的合併、切換規則、寫入。
// 不可在模組層級 import 瀏覽器 client 或 next/*。
import type { FundMember } from '../fund.ts';

export interface RoleRow { member_id: number; nickname: string; user_id: string | null; role: 'accountant' | 'member'; exited?: true }

const LAST = '至少要保留一位會計';

export const roleRows = (
  members: Pick<FundMember, 'id' | 'nickname' | 'user_id' | 'active'>[],
  roles: { user_id: string; role: string }[],
): RoleRow[] => {
  const acc = new Set(roles.filter((r) => r.role === 'accountant').map((r) => r.user_id));
  // 已退出但仍是會計的成員也列出（標 exited），否則看不到也無法降級，寫入權限卻還在
  return members.filter((m) => m.active || (!!m.user_id && acc.has(m.user_id))).map((m) => ({
    member_id: m.id,
    nickname: m.nickname,
    user_id: m.user_id,
    role: m.user_id && acc.has(m.user_id) ? 'accountant' : 'member',
    ...(m.active ? {} : { exited: true as const }),
  }));
};

export const canChange = (
  row: RoleRow, to: 'accountant' | 'member', rows: RoleRow[], selfUserId: string,
): { ok: true } | { ok: false; reason: string } => {
  // 無法確認自己是誰時一律拒絕（fail closed），否則自我降級檢查會失效。
  if (!selfUserId) return { ok: false, reason: '無法確認目前登入的帳號，請重新整理' };
  if (!row.user_id) return { ok: false, reason: '這位成員還沒有登入帳號' };
  if (to === 'member' && row.role === 'accountant') {
    if (row.user_id === selfUserId) return { ok: false, reason: '不能移除自己的會計權限，請由另一位會計操作' };
    // 沒有對應啟用成員列的會計在此看不到，因此這裡偏保守；真正的防線是資料庫 trigger。
    const others = rows.filter((r) => r.role === 'accountant' && r.user_id !== row.user_id);
    if (others.length === 0) return { ok: false, reason: LAST };
  }
  return { ok: true };
};

export const setRole = async (
  client: { from: (t: string) => any },
  userId: string,
  to: 'accountant' | 'member',
): Promise<void> => {
  const { error } = to === 'accountant'
    ? await client.from('fund_roles').upsert({ user_id: userId, role: 'accountant' })
    : await client.from('fund_roles').delete().eq('user_id', userId);
  if (error) throw error;
};

export const roleErrorText = (e: unknown): string => {
  const msg = String((e as { message?: unknown } | null)?.message ?? e);
  return msg.includes(LAST) ? LAST : msg;
};
