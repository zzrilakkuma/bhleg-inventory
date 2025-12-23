'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id;

  const [item, setItem] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    // 模擬資料
    const mockItems = [
      {
        id: 1,
        name: '醬油（龜甲萬 500ml）',
        unit: '瓶',
        stock: 3,
        category: '廚房',
        isRegularItem: true,
        note: '放置於廚房右側櫃子',
        images: [],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 2,
        name: '醬油（金蘭 1L）',
        unit: '瓶',
        stock: 2,
        category: '廚房',
        isRegularItem: false,
        note: '',
        images: [],
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 3,
        name: '白米（池上米）',
        unit: '包',
        stock: 0,
        category: '廚房',
        isRegularItem: true,
        note: '需要補貨',
        images: [],
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      },
    ];

    // 從 localStorage 讀取使用者新增的物品
    const storedItems = JSON.parse(localStorage.getItem('items') || '[]');
    const allItems = [...mockItems, ...storedItems];

    // 找到對應的物品
    const foundItem = allItems.find(i => i.id === Number(itemId));
    setItem(foundItem);

    // 從 localStorage 讀取真實的歷史記錄
    if (foundItem) {
      const allRecords = JSON.parse(localStorage.getItem('records') || '[]');
      // 篩選出此物品的記錄
      const itemRecords = allRecords.filter((record: any) => record.itemId === foundItem.id);
      setHistory(itemRecords);
    }
  }, [itemId]);

  // 格式化時間
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

  if (!item) {
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
          物品詳情
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// ITEM_DETAIL</p>
      </header>

      <main className="w-full max-w-2xl mx-auto space-y-6">
        {/* 物品基本資訊 */}
        <div className="p-6 bg-[#0a0a0a] border border-[#00FF41] rounded" style={{
          boxShadow: '0 0 10px rgba(0, 255, 65, 0.2)'
        }}>
          <div className="mb-4">
            <h2 className="text-xl font-bold text-white">
              {item.isRegularItem && <span className="mr-2">📌</span>}
              {item.name}
            </h2>
            {item.isRegularItem && (
              <span className="inline-block mt-2 px-2 py-1 text-xs bg-[rgba(0,255,65,0.1)] border border-[#00FF41] rounded text-[#00FF41] font-mono">
                常態性備品
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
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
            <p className={`text-3xl font-bold font-mono ${
              item.stock === 0 ? 'text-[#FF0055]' : 'text-[#00FF41]'
            }`}>
              {item.stock} {item.unit}
            </p>
          </div>

          {history.length > 0 && history[0].note && (
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">最近備註：</p>
              <p className="text-white">{history[0].note}</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {getRelativeTime(history[0].timestamp)}
              </p>
            </div>
          )}

          {(() => {
            // 找到最後一筆有圖片的記錄
            const recordWithImages = history.find((record: any) => record.images && record.images.length > 0);
            if (recordWithImages && recordWithImages.images.length > 0) {
              return (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-mono mb-2">照片：</p>
                  <div className="grid grid-cols-3 gap-2">
                    {recordWithImages.images.map((image: string, index: number) => (
                      <div
                        key={index}
                        className="aspect-square cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxImage(image)}
                      >
                        <img
                          src={image}
                          alt={`物品照片 ${index + 1}`}
                          className="w-full h-full object-cover rounded border border-[#333333] hover:border-[#00FF41] transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 font-mono mt-2">
                    最後拍攝：{getRelativeTime(recordWithImages.timestamp)}
                  </p>
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* 門檻資訊 - 只有常態性備品才顯示 */}
        {item.isRegularItem && (item.warningThreshold !== null || item.criticalThreshold !== null) && (
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-3">庫存門檻設定：</p>
            <div className="grid grid-cols-2 gap-4">
              {item.warningThreshold !== null && (
                <div>
                  <p className="text-xs text-gray-500 font-mono mb-1">須留意：</p>
                  <p className="text-sm text-[#FFFF00] font-mono">≤ {item.warningThreshold} {item.unit}</p>
                </div>
              )}
              {item.criticalThreshold !== null && (
                <div>
                  <p className="text-xs text-gray-500 font-mono mb-1">待補充：</p>
                  <p className="text-sm text-[#FF0055] font-mono">≤ {item.criticalThreshold} {item.unit}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 時間資訊 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-1">建立時間：</p>
            <p className="text-sm text-white font-mono">{formatDate(item.createdAt)}</p>
          </div>
          <div className="p-4 bg-[#0a0a0a] border border-[#333333] rounded">
            <p className="text-xs text-gray-500 font-mono mb-1">最後更新：</p>
            <p className="text-sm text-white font-mono">{getRelativeTime(item.updatedAt)}</p>
          </div>
        </div>

        {/* 快速操作 */}
        <div className="grid grid-cols-2 gap-4">
          <Link
            href={`/record-in?itemId=${item.id}`}
            className="py-4 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all text-center"
          >
            <div className="text-sm text-[#00FF41] font-semibold">+ 記錄入庫</div>
          </Link>
          <Link
            href={`/record-out?itemId=${item.id}`}
            className="py-4 px-6 rounded border border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent hover:from-[rgba(0,255,65,0.2)] transition-all text-center"
          >
            <div className="text-sm text-[#00FF41] font-semibold">− 記錄出庫</div>
          </Link>
        </div>

        {/* 歷史記錄 */}
        <div>
          <h3 className="text-lg font-bold text-[#00FF41] mb-1 font-mono">
            歷史記錄
          </h3>
          <p className="text-sm text-gray-500 font-mono mb-4">// HISTORY</p>

          {history.length > 0 ? (
            <div className="space-y-3">
              {history.map((record) => (
                <Link
                  key={record.id}
                  href={`/records/${record.id}`}
                  className="block p-4 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-bold font-mono ${
                        record.type === 'in' ? 'text-[#00FF41]' : 'text-[#FF0055]'
                      }`}>
                        {record.type === 'in' ? '+' : '−'}{record.quantity} {item.unit}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {record.type === 'in' ? '入庫' : '出庫'}
                      </span>
                      {record.images && record.images.length > 0 && (
                        <span className="text-gray-500 text-sm">📷</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 font-mono">
                      {getRelativeTime(record.timestamp)}
                    </span>
                  </div>

                  {record.note && (
                    <p className="text-sm text-gray-400 mb-2">{record.note}</p>
                  )}

                  <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
                    <span>操作人：{record.user}</span>
                    <span>|</span>
                    <span>{formatDate(record.timestamp)}</span>
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
