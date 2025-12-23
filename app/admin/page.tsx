'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import toast from 'react-hot-toast';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('請先登入');
      window.location.href = '/login';
      return;
    }

    // Check if user is admin
    const userIsAdmin = user.user_metadata?.is_admin === true;

    if (!userIsAdmin) {
      toast.error('需要管理員權限');
      window.location.href = '/';
      return;
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[#00FF41] font-mono">載入中...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      <header className="mb-8">
        <Link
          href="/"
          className="inline-block text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono mb-4"
        >
          ← 返回首頁
        </Link>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{
          textShadow: '0 0 10px rgba(0, 255, 65, 0.3)'
        }}>
          管理員後台
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// ADMIN_PANEL</p>
      </header>

      <main className="w-full max-w-md mx-auto">
        <div className="space-y-4">
          <Link
            href="/admin/users"
            className="block w-full py-6 px-6 rounded border border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41] transition-colors duration-200"
          >
            <div className="text-left">
              <div className="text-xs text-gray-500 font-mono mb-1">// 管理使用者</div>
              <div className="text-lg font-semibold text-white">使用者管理</div>
            </div>
          </Link>

          <Link
            href="/admin/stock-thresholds"
            className="block w-full py-6 px-6 rounded border border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41] transition-colors duration-200"
          >
            <div className="text-left">
              <div className="text-xs text-gray-500 font-mono mb-1">// 設定門檻</div>
              <div className="text-lg font-semibold text-white">庫存門檻設定</div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
