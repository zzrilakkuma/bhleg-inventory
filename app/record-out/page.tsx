'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { itemsApi, recordsApi, uploadImages } from '@/lib/supabase-client';
import toast from 'react-hot-toast';

function RecordOutForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const itemIdFromUrl = searchParams.get('itemId');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [recentRecords, setRecentRecords] = useState<any[]>([]);
  const [showRecentRecords, setShowRecentRecords] = useState(true);

  // 載入物品列表和最近記錄
  useEffect(() => {
    loadItems();
    loadRecentRecords();
  }, []);

  // 如果 URL 中有 itemId，自動選擇該物品
  useEffect(() => {
    if (itemIdFromUrl && allItems.length > 0) {
      const item = allItems.find(i => i.id === Number(itemIdFromUrl));
      if (item) {
        setSelectedItem(item);
      }
    }
  }, [itemIdFromUrl, allItems]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const items = await itemsApi.getAll();
      setAllItems(items);
    } catch (err: any) {
      console.error('載入物品列表失敗:', err);
      toast.error('載入物品列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const loadRecentRecords = async () => {
    try {
      const records = await recordsApi.getRecentOut(3);
      setRecentRecords(records);
    } catch (err: any) {
      console.error('載入最近記錄失敗:', err);
    }
  };

  // 計算相對時間
  const getRelativeTime = (dateString: string) => {
    if (!dateString) return '未知';

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    if (images.length + files.length > 5) {
      toast.error('最多只能上傳 5 張照片');
      return;
    }

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} 檔案過大，請選擇小於 5MB 的圖片`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setImages((prev) => [...prev, result]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const filteredItems = allItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!selectedItem || !quantity) {
      toast.error('請選擇物品並輸入數量');
      return;
    }

    const outQuantity = Number(quantity);

    if (isNaN(outQuantity) || outQuantity <= 0) {
      toast.error('請輸入有效的數量');
      return;
    }

    const newStock = selectedItem.stock - outQuantity;

    // 檢查庫存是否足夠
    if (newStock < 0) {
      toast.error(`庫存不足！目前庫存：${selectedItem.stock} ${selectedItem.unit}，無法出庫 ${outQuantity} ${selectedItem.unit}`);
      return;
    }

    // 庫存即將歸零的警告
    if (newStock === 0) {
      toast(`⚠️ 警告：此操作將使「${selectedItem.name}」庫存歸零`, {
        duration: 4000,
        style: {
          background: '#0a0a0a',
          color: '#FFFF00',
          border: '1px solid #FFFF00',
          boxShadow: '0 0 10px rgba(255, 255, 0, 0.3)',
        },
      });
    }

    try {
      setSubmitting(true);

      // 處理圖片上傳
      let imageUrls: string[] = [];
      if (images.length > 0) {
        toast.loading('正在上傳圖片...', { id: 'uploading' });
        imageUrls = await uploadImages('record-images', images);
        toast.dismiss('uploading');
      }

      // 建立出庫記錄（API 會自動更新庫存並檢查庫存是否足夠）
      await recordsApi.create({
        item_id: selectedItem.id,
        type: 'out',
        quantity: outQuantity,
        reason: note || '出庫',
        image_urls: imageUrls,
      } as any);

      toast.success(`成功記錄出庫：${selectedItem.name} -${quantity} ${selectedItem.unit}`);

      // 清空表單
      setSearchQuery('');
      setSelectedItem(null);
      setQuantity('');
      setNote('');
      setImages([]);

      // 重新載入物品列表和最近記錄
      await loadItems();
      await loadRecentRecords();
    } catch (err: any) {
      console.error('出庫失敗:', err);
      toast.error(err.message || '出庫失敗');
    } finally {
      setSubmitting(false);
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
          記錄出庫
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// RECORD_OUT</p>
      </header>

      <main className="w-full max-w-md mx-auto space-y-6">
        {/* 搜尋物品 */}
        <div>
          <label className="block text-sm text-gray-400 mb-2 font-mono">搜尋物品：</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="輸入物品名稱..."
            className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono"
            style={{
              caretColor: '#00FF41'
            }}
          />
        </div>

        {/* 搜尋結果 */}
        {searchQuery && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-mono">搜尋結果：</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedItem(item);
                      setSearchQuery('');
                    }}
                    className="w-full p-4 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] transition-colors text-left"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-medium">{item.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          目前庫存：{item.stock} {item.unit}
                        </p>
                      </div>
                      <span className="text-xs text-[#00FF41] font-mono">✓</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="w-full p-4 bg-[#0a0a0a] border border-[#333333] rounded text-center">
                  <p className="text-gray-400">找不到「{searchQuery}」</p>
                  <Link
                    href={`/items/new?name=${encodeURIComponent(searchQuery)}&returnTo=/record-out`}
                    className="text-sm text-[#00FF41] hover:underline mt-2 inline-block"
                  >
                    + 新增此物品
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 最近出庫記錄 */}
        {!searchQuery && !selectedItem && recentRecords.length > 0 && (
          <div className="border border-[#333333] rounded bg-[#0a0a0a]">
            <button
              onClick={() => setShowRecentRecords(!showRecentRecords)}
              className="w-full p-4 flex items-center justify-between hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 font-mono">最近出庫</span>
                <span className="text-xs text-gray-600 font-mono">({recentRecords.length})</span>
              </div>
              <span className="text-gray-500 font-mono text-sm">
                {showRecentRecords ? '▲' : '▼'}
              </span>
            </button>

            {showRecentRecords && (
              <div className="px-4 pb-4 space-y-2">
                {recentRecords.map((record: any) => (
                  <Link
                    key={record.id}
                    href={`/inventory/${record.item_id}`}
                    className="block p-3 border border-[#333333] rounded hover:border-[#555555] transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-white font-medium flex-1">{record.items?.name}</p>
                      <span className="text-xs text-gray-500 font-mono ml-2">
                        {getRelativeTime(record.created_at)}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-[#FF0055] font-mono text-sm font-bold">
                        -{record.quantity} {record.items?.unit}
                      </span>
                      <span className="text-gray-500 text-xs font-mono">
                        → {record.stock_after} {record.items?.unit}
                      </span>
                    </div>
                    {record.reason && (
                      <p className="text-xs text-gray-500 font-mono line-clamp-1">
                        // {record.reason}
                      </p>
                    )}
                    {record.operator?.name && (
                      <p className="text-xs text-gray-600 font-mono mt-1">
                        {record.operator.name}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 已選擇的物品 */}
        {selectedItem && (
          <div className="p-4 bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent border border-[#00FF41] rounded">
            <p className="text-xs text-gray-500 mb-2 font-mono">已選擇：</p>
            <p className="text-white font-medium">{selectedItem.name}</p>
            <p className="text-xs text-gray-400 mt-1">
              目前庫存：{selectedItem.stock} {selectedItem.unit}
            </p>
          </div>
        )}

        {/* 輸入數量 */}
        {selectedItem && (
          <>
            <div>
              <label className="block text-sm text-gray-400 mb-3 font-mono">
                出庫數量：
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {/* 減少按鈕 */}
                  <button
                    onClick={() => {
                      const current = parseFloat(quantity) || 0;
                      const newValue = Math.max(0, current - 0.5);
                      setQuantity(newValue.toString());
                    }}
                    className="w-16 h-16 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] hover:bg-[rgba(0,255,65,0.1)] transition-all active:scale-95 flex items-center justify-center"
                  >
                    <span className="text-2xl text-white font-bold">−</span>
                  </button>

                  {/* 數量顯示 */}
                  <div className="flex-1">
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="0"
                      min="0"
                      step="0.5"
                      className="w-full px-4 py-4 bg-[#0a0a0a] border border-[#00FF41] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] focus:shadow-[0_0_10px_rgba(0,255,65,0.3)] transition-all font-mono text-center text-2xl font-bold"
                      style={{
                        caretColor: '#00FF41'
                      }}
                    />
                  </div>

                  {/* 增加按鈕 */}
                  <button
                    onClick={() => {
                      const current = parseFloat(quantity) || 0;
                      const newValue = current + 0.5;
                      setQuantity(newValue.toString());
                    }}
                    className="w-16 h-16 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] hover:bg-[rgba(0,255,65,0.1)] transition-all active:scale-95 flex items-center justify-center"
                  >
                    <span className="text-2xl text-[#00FF41] font-bold">+</span>
                  </button>
                </div>
                {/* 單位顯示 */}
                <div className="text-center">
                  <span className="text-gray-400 font-mono text-sm">{selectedItem.unit}</span>
                </div>
                {/* 庫存提示 */}
                {quantity && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500 font-mono">
                      出庫後庫存：
                      <span className={`ml-2 ${
                        selectedItem.stock - Number(quantity) < 0
                          ? 'text-[#FF0055]'
                          : selectedItem.stock - Number(quantity) === 0
                          ? 'text-[#FFFF00]'
                          : 'text-[#00FF41]'
                      }`}>
                        {selectedItem.stock - Number(quantity)} {selectedItem.unit}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 備註 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-mono">
                備註（選填）：
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：使用目的、領用人等..."
                rows={3}
                className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono text-sm resize-none"
                style={{
                  caretColor: '#00FF41'
                }}
              />
            </div>

            {/* 上傳照片 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-mono">
                上傳照片（選填，最多 5 張）：
              </label>

              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {images.map((image, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={image}
                        alt={`預覽 ${index + 1}`}
                        className="w-full h-full object-cover rounded border border-[#333333]"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 w-6 h-6 bg-[#FF0055] rounded-full flex items-center justify-center text-white text-xs hover:bg-[#FF0077] transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {images.length < 5 && (
                <label className="block w-full p-4 border-2 border-dashed border-[#333333] rounded hover:border-[#00FF41] transition-colors cursor-pointer">
                  <div className="text-center">
                    <span className="text-gray-500 font-mono text-sm">📷 點擊上傳照片</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </label>
              )}
            </div>

            {/* 送出按鈕 */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 bg-gradient-to-br from-[rgba(0,255,65,0.2)] to-transparent border border-[#00FF41] rounded hover:from-[rgba(0,255,65,0.3)] transition-all duration-200 text-[#00FF41] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)'
              }}
            >
              {submitting ? '處理中...' : '確認送出'}
            </button>
          </>
        )}
      </main>
    </div>
  );
}

export default function RecordOutPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[#00FF41] font-mono">載入中...</div>
      </div>
    }>
      <RecordOutForm />
    </Suspense>
  );
}
