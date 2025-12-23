'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { recordsApi } from '@/lib/supabase-client';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function RecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = params.id;

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadRecord();
  }, [recordId]);

  const loadRecord = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await recordsApi.getById(Number(recordId));
      setRecord(data);
    } catch (err: any) {
      console.error('載入記錄失敗:', err);
      setError(err.message || '載入失敗');
      toast.error('載入記錄失敗');
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

  if (error || !record) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="text-[#FF0055] font-mono mb-4">{error || '找不到此記錄'}</div>
        <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono">← 返回上一頁</button>
      </div>
    );
  }

  const item = record.items;
  const previousStock = record.type === 'in'
    ? record.stock_after - record.quantity
    : record.stock_after + record.quantity;

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={selectedImage}
              className="max-w-full max-h-full rounded shadow-2xl border border-[#333]"
              alt="Full size view"
            />
            <button className="absolute top-6 right-6 text-white/50 hover:text-white text-2xl font-mono">[X]</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="mb-8">
        <button onClick={() => router.back()} className="inline-block text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono mb-4">← 返回上一頁</button>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{ textShadow: '0 0 10px rgba(0, 255, 65, 0.3)' }}>記錄詳情</h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// RECORD_DETAIL</p>
      </header>

      <main className="w-full max-w-2xl mx-auto space-y-6">
        {/* 交易資訊 */}
        <div className="p-6 bg-[#0a0a0a] border border-[#00FF41] rounded" style={{ boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)' }}>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">數量：</p>
              <p className={`text-3xl font-bold font-mono ${record.type === 'in' ? 'text-[#00FF41]' : 'text-[#FF0055]'}`}>
                {record.type === 'in' ? '+' : '-'}{record.quantity} {item?.unit || ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">時間：</p>
              <p className="text-white font-mono">{formatDate(record.created_at)}</p>
              <p className="text-xs text-gray-500 font-mono mt-1">{getRelativeTime(record.created_at)}</p>
            </div>
            {record.operator?.name && (
              <div>
                <p className="text-xs text-gray-500 font-mono mb-1">操作人：</p>
                <p className="text-[#00FF41] font-mono">{record.operator.name}</p>
              </div>
            )}
          </div>
        </div>

        {/* 庫存變化 */}
        {item && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-3">庫存變化：</p>
            <div className="flex items-center gap-3 font-mono text-lg text-sm">
              <span className="text-gray-400">{previousStock} {item.unit}</span>
              <span className="text-gray-600">→</span>
              <span className={record.type === 'in' ? 'text-[#00FF41]' : 'text-[#FF0055]'}>
                {record.type === 'in' ? '+' : '-'}{record.quantity}
              </span>
              <span className="text-gray-600">→</span>
              <span className="text-white font-bold">{record.stock_after} {item.unit}</span>
            </div>
          </div>
        )}

        {/* 照片展示 */}
        {record.image_urls && record.image_urls.length > 0 && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-3">照片：</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {record.image_urls.map((url: string, index: number) => (
                <button 
                  key={index} 
                  onClick={() => setSelectedImage(url)}
                  className="relative aspect-square rounded overflow-hidden border border-[#333] hover:border-[#00FF41] transition-all group"
                >
                  <img src={url} alt={`Record image ${index + 1}`} className="w-full h-full object-cover grayscale-[0.5] group-hover:grayscale-0 transition-all" />
                  <div className="absolute inset-0 bg-[#00FF41]/0 group-hover:bg-[#00FF41]/10 flex items-center justify-center">
                    <span className="text-[10px] text-[#00FF41] opacity-0 group-hover:opacity-100 font-mono">ENLARGE</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 關聯物品 */}
        {item && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-3">關聯物品：</p>
            <div className="mb-4">
              <h3 className="text-xl font-bold text-white mb-2">{item.name}</h3>
              <div className="flex items-center gap-3 text-sm text-gray-400 font-mono">
                <span>{item.category}</span>
                <span>|</span>
                <span>目前庫存：{item.stock} {item.unit}</span>
              </div>
            </div>
            <Link href={`/inventory/${item.id}`} className="inline-block px-4 py-2 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all text-sm text-[#00FF41] font-mono">查看物品詳情 →</Link>
          </div>
        )}

        {/* 備註 */}
        {record.reason && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-2">備註：</p>
            <p className="text-white text-sm leading-relaxed">{record.reason}</p>
          </div>
        )}
      </main>
    </div>
  );
}