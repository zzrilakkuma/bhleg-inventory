"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/lib/fund-v2/role';

/** 只有會計能看 children；非會計導回 /fund-v2。載入中不渲染。 */
export function RoleGate({ accountant, children }: { accountant: boolean; children: React.ReactNode }) {
  const role = useRole();
  const router = useRouter();
  const denied = accountant && role === 'member';
  useEffect(() => { if (denied) router.replace('/fund-v2'); }, [denied, router]);
  if (role === null || denied) return null;
  return <>{children}</>;
}
