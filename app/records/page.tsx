'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { recordsApi } from '@/lib/supabase-client';
import toast from 'react-hot-toast';

export default function RecordsPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      setLoading(true);
      setError(null);

      // 從 Supabase 讀取所有記錄（包含關聯的物品資料）
      const data = await recordsApi.getAll();
      setRecords(data);
    } catch (err: any) {
      console.error('載入記錄失敗:', err);
      setError(err.message || '載入失敗');
      toast.error('載入記錄失敗');
    } finally {
      setLoading(false);
    }
  };

  // 計算相對時間
  const getRelativeTime = (dateString: string) => {
    const now = new Date().getTime();
    const date = new Date(dateString).getTime();
    const diff = now - date;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes} 分鐘前`;
    if (hours < 24) return `${hours} 小時前`;
    return `${days} 天前`;
  };

  // 格式化完整時間
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
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

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-[#FF0055] font-mono mb-4">{error}</div>
        <button
          onClick={loadRecords}
          className="text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono"
        >
          重新載入
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      {/* Header */}
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
          最近記錄
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// RECENT_RECORDS</p>
      </header>

      <main className="w-full max-w-2xl mx-auto">
        {/* 記錄列表 */}
        <div className="space-y-3">
          {records.length > 0 ? (
            records.map((record) => {
              // 從關聯的 items 物件取得物品資料
              const itemData = record.items;

              return (
                <Link
                  key={record.id}
                  href={`/records/${record.id}`}
                  className="block p-4 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="text-white font-medium">
                        {itemData?.name || `物品 #${record.item_id}`}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-lg font-bold font-mono ${
                          record.type === 'in' ? 'text-[#00FF41]' : 'text-[#FF0055]'
                        }`}>
                          {record.type === 'in' ? '+' : '-'}{record.quantity} {itemData?.unit || ''}
                        </span>
                        {record.image_urls && record.image_urls.length > 0 && (
                          <span className="text-xs text-[#00FF41]">📷</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600 font-mono whitespace-nowrap ml-3">
                      {getRelativeTime(record.created_at)}
                    </span>
                  </div>

                  {record.reason && (
                    <div className="mb-2">
                      <p className="text-sm text-gray-400">{record.reason}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-y-1 text-xs text-gray-600 font-mono border-t border-[#1a1a1a] pt-3 mt-3">
                    <div className="flex items-center gap-2">
                      <span>{formatDate(record.created_at)}</span>
                      <span className="opacity-30">|</span>
                      <span>{record.stock_after} {itemData?.unit || ''}</span>
                    </div>
                    {record.operator?.name && (
                      <span className="ml-auto">by {record.operator.name}</span>
                    )}
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="p-12 text-center border border-[#333333] border-dashed rounded">
              <p className="text-gray-500 font-mono">尚無任何記錄</p>
              <p className="text-sm text-gray-600 font-mono mt-2">
                開始記錄入庫或出庫後，記錄將會顯示在這裡
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
