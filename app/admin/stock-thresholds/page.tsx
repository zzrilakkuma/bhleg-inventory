'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { itemsApi } from '@/lib/supabase-client';
import toast from 'react-hot-toast';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Item {
  id: number;
  name: string;
  unit: string;
  stock: number;
  category: string;
  is_regular_item: boolean;
  low_stock_threshold?: number;
  updated_at: string;
}

export default function StockThresholdsPage() {
  const [loading, setLoading] = useState(true);
  const [regularItems, setRegularItems] = useState<Item[]>([]);
  const [thresholds, setThresholds] = useState<{ [key: number]: string }>({});
  const [saving, setSaving] = useState<{ [key: number]: boolean }>({});

  useEffect(() => {
    checkAdminAndLoadItems();
  }, []);

  const checkAdminAndLoadItems = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('請先登入');
      window.location.href = '/login';
      return;
    }

    const userIsAdmin = user.user_metadata?.is_admin === true;

    if (!userIsAdmin) {
      toast.error('需要管理員權限');
      window.location.href = '/';
      return;
    }

    loadRegularItems();
  };

  const loadRegularItems = async () => {
    try {
      setLoading(true);

      // 從 Supabase 載入所有物品
      const allItems = await itemsApi.getAll();

      // 只取常態性備品
      const regular = allItems.filter((item: Item) => item.is_regular_item === true);

      setRegularItems(regular);

      // 初始化門檻值
      const initialThresholds: { [key: number]: string } = {};
      regular.forEach((item: Item) => {
        initialThresholds[item.id] = item.low_stock_threshold?.toString() || '';
      });
      setThresholds(initialThresholds);
    } catch (err: any) {
      console.error('載入物品失敗:', err);
      toast.error('載入物品失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleThresholdChange = (itemId: number, value: string) => {
    setThresholds(prev => ({
      ...prev,
      [itemId]: value,
    }));
  };

  const saveThreshold = async (itemId: number) => {
    const thresholdValue = thresholds[itemId];

    try {
      setSaving(prev => ({ ...prev, [itemId]: true }));

      let thresholdNumber: number | undefined = undefined;

      if (thresholdValue !== '') {
        const numericValue = parseFloat(thresholdValue);

        if (isNaN(numericValue) || numericValue < 0) {
          toast.error('請輸入有效的數字');
          return;
        }

        thresholdNumber = numericValue;
      }

      // 更新 Supabase 中的物品
      await itemsApi.update(itemId, {
        low_stock_threshold: thresholdNumber,
      });

      if (thresholdNumber === undefined) {
        toast.success('已移除門檻設定');
      } else {
        toast.success('門檻設定已儲存');
      }

      // 重新載入物品列表
      await loadRegularItems();
    } catch (err: any) {
      console.error('儲存失敗:', err);
      toast.error(err.message || '儲存失敗');
    } finally {
      setSaving(prev => ({ ...prev, [itemId]: false }));
    }
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
          庫存門檻設定
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// STOCK_THRESHOLDS</p>
      </header>

      <main className="w-full max-w-2xl mx-auto">
        {regularItems.length === 0 ? (
          <div className="p-12 text-center border border-[#333333] border-dashed rounded">
            <p className="text-gray-500 font-mono">目前沒有常態性備品</p>
            <p className="text-sm text-gray-600 font-mono mt-2">
              在新增物品時勾選「常態性備品」即可在此設定門檻
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-lg text-white font-semibold mb-2">常態性備品列表</h2>
              <p className="text-sm text-gray-500 font-mono">
                共 {regularItems.length} 項常態性備品
              </p>
            </div>

            {regularItems.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <p className="text-white font-medium">{item.name}</p>
                    <p className="text-sm text-gray-500 font-mono mt-1">
                      目前庫存：{item.stock} {item.unit}
                    </p>
                  </div>
                  {item.low_stock_threshold !== undefined && (
                    <span className="px-2 py-1 text-xs bg-[#333333] rounded text-gray-400 font-mono flex-shrink-0">
                      門檻：{item.low_stock_threshold}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2">
                    <label className="text-sm text-gray-400 font-mono whitespace-nowrap">
                      低庫存門檻：
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={thresholds[item.id] || ''}
                      onChange={(e) => handleThresholdChange(item.id, e.target.value)}
                      placeholder="未設定"
                      className="w-24 px-3 py-2 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono text-sm"
                    />
                    <span className="text-sm text-gray-500 font-mono">{item.unit}</span>
                  </div>

                  <button
                    onClick={() => saveThreshold(item.id)}
                    disabled={saving[item.id]}
                    className="px-4 py-2 rounded border border-[#00FF41] text-[#00FF41] hover:bg-[rgba(0,255,65,0.1)] transition-all font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving[item.id] ? '儲存中...' : '儲存'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
