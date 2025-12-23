'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function RecordDetailPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = params.id;

  const [record, setRecord] = useState<any>(null);
  const [item, setItem] = useState<any>(null);
  const [previousStock, setPreviousStock] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    // 從 localStorage 讀取所有記錄
    const allRecords = JSON.parse(localStorage.getItem('records') || '[]');
    const foundRecord = allRecords.find((r: any) => r.id === Number(recordId));
    setRecord(foundRecord);

    if (foundRecord) {
      // 讀取關聯的物品資料
      const mockItems = [
        { id: 1, name: '醬油（龜甲萬 500ml）', unit: '瓶', stock: 3, category: '廚房', isRegularItem: true, updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
        { id: 2, name: '醬油（金蘭 1L）', unit: '瓶', stock: 2, category: '廚房', isRegularItem: false, updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
        { id: 3, name: '白米（池上米）', unit: '包', stock: 0, category: '廚房', isRegularItem: true, updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
      ];
      const storedItems = JSON.parse(localStorage.getItem('items') || '[]');
      const allItems = [...mockItems, ...storedItems];
      const foundItem = allItems.find((i: any) => i.id === foundRecord.itemId);
      setItem(foundItem);

      // 計算記錄發生前的庫存（用於顯示庫存變化）
      if (foundItem) {
        if (foundRecord.type === 'in') {
          setPreviousStock(foundItem.stock - foundRecord.quantity);
        } else {
          setPreviousStock(foundItem.stock + foundRecord.quantity);
        }
      }
    }
  }, [recordId]);

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

  if (!record) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[#00FF41] font-mono">載入中...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      {/* Header */}
      <header className="mb-8">
        <button
          onClick={() => router.back()}
          className="inline-block text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono mb-4"
        >
          ← 返回上一頁
        </button>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{
          textShadow: '0 0 10px rgba(0, 255, 65, 0.3)'
        }}>
          記錄詳情
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// RECORD_DETAIL</p>
      </header>

      <main className="w-full max-w-2xl mx-auto space-y-6">
        {/* 交易資訊 */}
        <div className="p-6 bg-[#0a0a0a] border border-[#00FF41] rounded" style={{
          boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)'
        }}>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">數量：</p>
              <p className={`text-3xl font-bold font-mono ${
                record.type === 'in' ? 'text-[#00FF41]' : 'text-[#FF0055]'
              }`}>
                {record.type === 'in' ? '+' : '-'}{record.quantity} {record.unit}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">時間：</p>
              <p className="text-white font-mono">{formatDate(record.timestamp)}</p>
              <p className="text-xs text-gray-500 font-mono mt-1">
                {getRelativeTime(record.timestamp)}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">操作人：</p>
              <p className="text-white font-mono">{record.user}</p>
            </div>
          </div>
        </div>

        {/* 庫存變化 */}
        {previousStock !== null && item && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-3">庫存變化：</p>
            <div className="flex items-center gap-3 font-mono text-lg">
              <span className="text-gray-400">{previousStock} {record.unit}</span>
              <span className="text-gray-600">→</span>
              <span className={record.type === 'in' ? 'text-[#00FF41]' : 'text-[#FF0055]'}>
                {record.type === 'in' ? '+' : '-'}{record.quantity}
              </span>
              <span className="text-gray-600">→</span>
              <span className="text-white font-bold">{item.stock} {record.unit}</span>
            </div>
          </div>
        )}

        {/* 關聯物品 */}
        {item && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-3">關聯物品：</p>

            <div className="mb-4">
              <h3 className="text-xl font-bold text-white mb-2">
                {item.isRegularItem && <span className="mr-2">📌</span>}
                {item.name}
              </h3>
              <div className="flex items-center gap-3 text-sm text-gray-400 font-mono">
                <span>{item.category}</span>
                <span>|</span>
                <span>目前庫存：{item.stock} {item.unit}</span>
              </div>
            </div>

            <Link
              href={`/inventory/${item.id}`}
              className="inline-block px-4 py-2 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all text-sm text-[#00FF41] font-mono"
            >
              查看物品詳情 →
            </Link>
          </div>
        )}

        {/* 備註 */}
        {record.note && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-2">備註：</p>
            <p className="text-white leading-relaxed">{record.note}</p>
          </div>
        )}

        {/* 照片 */}
        {record.images && record.images.length > 0 && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-3">照片：</p>
            <div className="grid grid-cols-2 gap-3">
              {record.images.map((image: string, index: number) => (
                <div
                  key={index}
                  className="aspect-square cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setLightboxImage(image)}
                >
                  <img
                    src={image}
                    alt={`記錄照片 ${index + 1}`}
                    className="w-full h-full object-cover rounded border border-[#333333] hover:border-[#00FF41] transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 圖片燈箱 */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            <img
              src={lightboxImage}
              alt="放大檢視"
              className="max-w-full max-h-full object-contain rounded border border-[#00FF41]"
              style={{
                boxShadow: '0 0 20px rgba(0, 255, 65, 0.3)'
              }}
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 w-12 h-12 bg-[#0a0a0a] border border-[#00FF41] rounded-full flex items-center justify-center text-white hover:bg-[rgba(0,255,65,0.1)] transition-colors"
            >
              <span className="text-2xl">✕</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
