"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';

// Initialize the Supabase client.
// Note: We are creating a new client instance here for the page.
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsAdmin(user?.user_metadata?.is_admin === true);
      setLoading(false);
    };

    checkUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center font-mono text-gray-400">
        讀取使用者狀態...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center font-mono text-center">
        <p className="text-gray-400 mb-4">您尚未登入。</p>
        <Link href="/login" className="text-[#00FF41] hover:underline">
          [前往登入頁面]
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <main className="w-full max-w-md space-y-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-white" style={{ textShadow: '0 0 10px rgba(255, 255, 255, 0.5), 0 0 20px rgba(255, 255, 255, 0.3)' }}>
            巢穴 bhleg<span className="cursor-blink">_</span>
          </h1>
          <p className="text-sm text-gray-400 font-mono">物資流</p>
        </div>

        <div className="flex items-center justify-between px-4 py-2 rounded border border-[#333333] bg-[#0a0a0a]">
          <span className="text-sm text-gray-400 truncate">您好，{user.user_metadata.name || user.email}</span>
          <button onClick={handleLogout} className="text-xs text-[#00FF41] hover:underline font-mono flex-shrink-0 ml-4">
            [切換]
          </button>
        </div>

        <div className="space-y-4">
          <Link href="/record-in" className="block w-full py-6 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group" style={{ boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)' }}>
            <div className="text-left">
              <div className="text-xs text-gray-500 font-mono mb-1">// 記錄入庫</div>
              <div className="text-lg font-semibold text-[#00FF41]">&gt; RECORD_IN</div>
            </div>
          </Link>
          <Link href="/record-out" className="block w-full py-6 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all duration-200 group" style={{ boxShadow: '0 0 5px rgba(0, 255, 65, 0.3)' }}>
            <div className="text-left">
              <div className="text-xs text-gray-500 font-mono mb-1">// 記錄出庫</div>
              <div className="text-lg font-semibold text-[#00FF41]">&gt; RECORD_OUT</div>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Link href="/inventory" className="py-4 px-4 rounded border border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41] transition-colors duration-200 text-center">
            <div className="text-sm text-white font-medium">查看庫存</div>
          </Link>
          <Link href="/records" className="py-4 px-4 rounded border border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41] transition-colors duration-200 text-center">
            <div className="text-sm text-white font-medium">最近記錄</div>
          </Link>
        </div>

        {/* 管理員專用連結 */}
        {isAdmin && (
          <div className="mt-4">
            <Link
              href="/admin"
              className="block w-full py-3 px-4 text-center text-sm text-gray-500 hover:text-gray-400 transition-colors font-mono"
            >
              管理員後台
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}