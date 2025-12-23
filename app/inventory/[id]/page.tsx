'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { itemsApi, recordsApi } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id;

  const [item, setItem] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    loadItemAndHistory();
  }, [itemId]);

  const loadItemAndHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const itemData = await itemsApi.getById(Number(itemId));
      setItem(itemData);
      const recordsData = await recordsApi.getByItemId(Number(itemId));
      setHistory(recordsData);
    } catch (err: any) {
      console.error('載入物品資料失敗:', err);
      setError(err.message || '載入失敗');
      toast.error('載入物品資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[#00FF41] font-mono">載入中...</div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-[#FF0055] font-mono mb-4">{error || '找不到此物品'}</div>
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono">← 返回上一頁</button>
      </div>
    );
  }

  const lastImageRecord = history.find(r => r.image_urls && r.image_urls.length > 0);
  const displayImageUrl = lastImageRecord ? lastImageRecord.image_urls[0] : null;

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      {/* Lightbox */}
      <AnimatePresence>
        {isLightboxOpen && displayImageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsLightboxOpen(false)}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={displayImageUrl}
              className="max-w-full max-h-full rounded shadow-2xl border border-[#333]"
              alt={item.name}
            />
            <button className="absolute top-6 right-6 text-white/50 hover:text-white text-2xl font-mono">[X]</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="mb-8">
        <button onClick={() => router.back()} className="inline-block text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono mb-4">← 返回上一頁</button>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{ textShadow: '0 0 10px rgba(0, 255, 65, 0.3)' }}>物品詳情</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// ITEM_DETAIL</p>
      </header>

      <main className="w-full max-w-2xl mx-auto space-y-6">
        {/* 物品基本資訊 */}
        <div className="p-6 bg-[#0a0a0a] border border-[#00FF41] rounded relative overflow-hidden" style={{ boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)' }}>
          
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white mb-2">
                {item.is_regular_item && <span className="mr-2">📌</span>}
                {item.name}
              </h2>
              {item.is_regular_item && (
                <span className="inline-block px-2 py-1 text-[10px] bg-[rgba(0,255,65,0.1)] border border-[#00FF41] rounded text-[#00FF41] font-mono">常態性備品</span>
              )}
            </div>

            {/* 縮圖區域 */}
            {displayImageUrl && (
              <button 
                onClick={() => setIsLightboxOpen(true)}
                className="w-20 h-20 rounded border border-[#333] overflow-hidden flex-shrink-0 hover:border-[#00FF41] transition-all group relative"
              >
                <img src={displayImageUrl} alt={item.name} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" />
                <div className="absolute inset-0 bg-[#00FF41]/0 group-hover:bg-[#00FF41]/10 flex items-center justify-center">
                  <span className="text-[10px] text-[#00FF41] opacity-0 group-hover:opacity-100 font-mono">VIEW</span>
                </div>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 my-6">
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">類別：</p>
              <p className="text-white font-medium">{item.category}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">單位：</p>
              <p className="text-white font-medium">{item.unit}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-xs text-gray-500 font-mono mb-1">目前庫存：</p>
            <p className={`text-3xl font-bold font-mono ${item.stock === 0 ? 'text-[#FF0055]' : 'text-[#00FF41]'}`}>
              {item.stock} {item.unit}
            </p>
          </div>

          {item.location && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 font-mono mb-1">位置：</p>
              <p className="text-white">{item.location}</p>
            </div>
          )}

          {history.length > 0 && history[0].reason && (
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">最近備註：</p>
              <p className="text-white text-sm">{history[0].reason}</p>
              <p className="text-[10px] text-gray-600 mt-1 font-mono">{getRelativeTime(history[0].created_at)}</p>
            </div>
          )}
        </div>

        {/* 門檻資訊 */}
        {item.is_regular_item && typeof item.low_stock_threshold === 'number' && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-1">低庫存門檻：</p>
            <p className={`text-lg font-mono font-bold ${item.stock <= item.low_stock_threshold ? 'text-[#FF0055]' : 'text-[#00FF41]'}`}>≤ {item.low_stock_threshold} {item.unit}</p>
            {item.stock <= item.low_stock_threshold && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-[rgba(255,0,85,0.1)] border border-[#FF0055] rounded">
                <span className="text-[#FF0055]">⚠</span>
                <span className="text-sm text-[#FF0055] font-mono">庫存低於門檻</span>
              </div>
            )}
          </div>
        )}

        {/* 時間資訊 */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-gray-500 font-mono mb-1">建立時間：</p>
            <p className="text-gray-300 font-mono">{formatDate(item.created_at)}</p>
          </div>
          <div className="p-3 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-gray-500 font-mono mb-1">最後更新：</p>
            <p className="text-gray-300 font-mono">{getRelativeTime(item.updated_at)}</p>
          </div>
        </div>

        {/* 快速操作 */}
        <div className="grid grid-cols-2 gap-4">
          <Link href={`/record-in?itemId=${item.id}`} className="py-3 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all text-center">
            <div className="text-xs text-[#00FF41] font-semibold">+ 記錄入庫</div>
          </Link>
          <Link href={`/record-out?itemId=${item.id}`} className="py-3 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all text-center">
            <div className="text-xs text-[#00FF41] font-semibold">− 記錄出庫</div>
          </Link>
        </div>

        {/* 歷史記錄 */}
        <div>
          <h3 className="text-lg font-bold text-[#00FF41] mb-1 font-mono">歷史記錄</h3>
          <p className="text-sm text-gray-500 font-mono mb-4">// HISTORY</p>
          {history.length > 0 ? (
            <div className="space-y-3">
              {history.map((record) => (
                <Link key={record.id} href={`/records/${record.id}`} className="block p-4 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold font-mono ${record.type === 'in' ? 'text-[#00FF41]' : 'text-[#FF0055]'}`}>
                        {record.type === 'in' ? '+' : '−'}{record.quantity} {item.unit}
                      </span>
                      {record.image_urls && record.image_urls.length > 0 && <span className="text-xs text-[#00FF41]">📷</span>}
                    </div>
                    <span className="text-xs text-gray-600 font-mono">{getRelativeTime(record.created_at)}</span>
                  </div>
                  {record.reason && <p className="text-sm text-gray-400 mb-2">{record.reason}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-y-1 text-xs text-gray-600 font-mono border-t border-[#1a1a1a] pt-3 mt-3">
                    <div className="flex items-center gap-2">
                      <span>{formatDate(record.created_at)}</span>
                      <span className="opacity-30">|</span>
                      <span>{record.stock_after} {item.unit}</span>
                    </div>
                    {record.operator?.name && (
                      <span className="ml-auto">by {record.operator.name}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center border border-[#333333] border-dashed rounded">
              <p className="text-gray-500 font-mono">尚無歷史記錄</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}