"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { loadRole, resolveRoleOverride, RoleContext, type FundRole } from '@/lib/fund-v2/role';

const TABS = [
  { href: '/fund-v2', label: '帳', accountantOnly: false },
  { href: '/fund-v2/record', label: '記', accountantOnly: true },
  { href: '/fund-v2/settle', label: '算', accountantOnly: false },
];

export default function FundV2Layout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<FundRole | null>(null);
  const [preview, setPreview] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    loadRole(supabase).then((r) => {
      if (!alive) return;
      const o = resolveRoleOverride(window.location.search, process.env.NODE_ENV);
      setPreview(o === 'member');
      setRole(o ?? r);
    }).catch(() => { if (alive) setRole('member'); });
    return () => { alive = false; };
  }, []);

  const tabs = TABS.filter((t) => !t.accountantOnly || role === 'accountant');
  const active = (href: string) => (href === '/fund-v2' ? pathname === href : pathname.startsWith(href));

  return (
    <RoleContext.Provider value={role}>
      <div className="min-h-screen bg-black text-white md:flex">
        <aside aria-label="側欄" className="hidden md:flex md:flex-col w-40 shrink-0 border-r border-[#333333] p-4 gap-1 sticky top-0 h-screen">
          <Link href="/" className="text-xs text-gray-500 hover:text-white mb-4">← 首頁</Link>
          {tabs.map((t) => (
            <Link key={t.href} href={t.href}
              className={`px-3 py-2 rounded text-lg ${active(t.href) ? 'text-[#00FF41] bg-[rgba(0,255,65,0.08)]' : 'text-gray-300 hover:text-white'}`}>
              {t.label}
            </Link>
          ))}
          <div className="mt-4 flex flex-col gap-1 text-xs">
            <Link href="/fund-v2/stats" className={`px-3 py-1 ${active('/fund-v2/stats') ? 'text-[#00FF41]' : 'text-gray-500 hover:text-white'}`}>統計</Link>
            <Link href="/fund-v2/settings" className={`px-3 py-1 ${active('/fund-v2/settings') ? 'text-[#00FF41]' : 'text-gray-500 hover:text-white'}`}>設定</Link>
          </div>
        </aside>
        <main className="flex-1 min-w-0">
          {preview && <div className="bg-amber-500/10 border-b border-amber-500/50 text-amber-400 text-xs text-center py-1">以參與者身分預覽</div>}
          <div className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 md:pb-6">{children}</div>
        </main>
        <nav aria-label="主選單" className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-[#333333] bg-black pb-[env(safe-area-inset-bottom)]">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={active(t.href) ? 'page' : undefined}
              className={`flex-1 py-3 text-center text-base ${active(t.href) ? 'text-[#00FF41]' : 'text-gray-400'}`}>
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </RoleContext.Provider>
  );
}
