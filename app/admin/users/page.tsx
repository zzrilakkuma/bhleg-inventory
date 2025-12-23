'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import toast from 'react-hot-toast';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UserProfile {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

export default function UsersManagementPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    checkAdminAndLoadUsers();
  }, []);

  const checkAdminAndLoadUsers = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('請先登入');
      window.location.href = '/login';
      return;
    }

    setCurrentUserId(user.id);

    const userIsAdmin = user.user_metadata?.is_admin === true;

    if (!userIsAdmin) {
      toast.error('需要管理員權限');
      window.location.href = '/';
      return;
    }

    await loadUsers();
    setLoading(false);
  };

  const loadUsers = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      toast.error('Session expired');
      return;
    }

    try {
      const response = await supabase.functions.invoke('list-users', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        console.error('Error loading users:', response.error);
        toast.error(`載入使用者列表失敗`);
        return;
      }

      if (response.data?.error) {
        console.error('API error:', response.data);
        toast.error(`API 錯誤: ${response.data.error}`);
        return;
      }

      setUsers(response.data?.users || []);
    } catch (err) {
      console.error('Exception loading users:', err);
      toast.error(`載入失敗`);
    }
  };

  const toggleAdmin = async (userId: string, currentStatus: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      toast.error('Session expired');
      return;
    }

    const action = currentStatus ? 'demote' : 'promote';
    const actionText = currentStatus ? '移除管理員權限' : '授予管理員權限';

    const { error } = await supabase.functions.invoke('manage-admin', {
      body: {
        action,
        targetUserId: userId,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error('Error toggling admin:', error);
      toast.error(`${actionText}失敗`);
      return;
    }

    toast.success(`已${actionText}`);
    await loadUsers();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
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
          href="/admin"
          className="inline-block text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono mb-4"
        >
          ← 返回管理員後台
        </Link>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{
          textShadow: '0 0 10px rgba(0, 255, 65, 0.3)'
        }}>
          使用者管理
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// USER_MANAGEMENT</p>
      </header>

      <main className="w-full max-w-2xl mx-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg text-white font-semibold">使用者列表</h2>
            <span className="text-sm text-gray-500 font-mono">
              共 {users.length} 位使用者
            </span>
          </div>

          {users.map((user) => (
            <div
              key={user.id}
              className="p-4 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-white font-medium truncate">{user.name}</p>
                    {user.is_admin && (
                      <span className="px-2 py-1 text-xs bg-gradient-to-br from-[rgba(0,255,65,0.2)] to-transparent border border-[#00FF41] rounded text-[#00FF41] font-mono flex-shrink-0">
                        管理員
                      </span>
                    )}
                    {user.id === currentUserId && (
                      <span className="px-2 py-1 text-xs bg-[#333333] rounded text-gray-400 font-mono flex-shrink-0">
                        你
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono mb-1 truncate">
                    {user.email}
                  </p>
                  <p className="text-xs text-gray-600 font-mono">
                    建立時間：{formatDate(user.created_at)}
                  </p>
                  {user.last_sign_in_at && (
                    <p className="text-xs text-gray-600 font-mono">
                      最後登入：{formatDate(user.last_sign_in_at)}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => toggleAdmin(user.id, user.is_admin)}
                  disabled={user.id === currentUserId}
                  className={`px-4 py-2 rounded border transition-all font-mono text-sm flex-shrink-0 ${
                    user.id === currentUserId
                      ? 'border-[#333333] text-gray-600 cursor-not-allowed'
                      : user.is_admin
                      ? 'border-[#FF0055] text-[#FF0055] hover:bg-[rgba(255,0,85,0.1)]'
                      : 'border-[#00FF41] text-[#00FF41] hover:bg-[rgba(0,255,65,0.1)]'
                  }`}
                >
                  {user.id === currentUserId
                    ? '(自己)'
                    : user.is_admin
                    ? '移除權限'
                    : '設為管理員'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
