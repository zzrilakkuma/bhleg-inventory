'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { itemsApi, recordsApi, uploadImages } from '@/lib/supabase-client';
import toast from 'react-hot-toast';

function RecordInForm() {
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

  // 載入物品列表
  useEffect(() => {
    loadItems();
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

    const inQuantity = Number(quantity);
    if (isNaN(inQuantity) || inQuantity <= 0) {
      toast.error('請輸入有效的數量');
      return;
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

      // 建立入庫記錄
      await recordsApi.create({
        item_id: selectedItem.id,
        type: 'in',
        quantity: inQuantity,
        reason: note || '入庫',
        image_urls: imageUrls,
      } as any);

      toast.success(`成功記錄入庫：${selectedItem.name} +${quantity} ${selectedItem.unit}`);

      // 清空表單
      setSearchQuery('');
      setSelectedItem(null);
      setQuantity('');
      setNote('');
      setImages([]);

      // 重新載入物品列表
      await loadItems();
    } catch (err: any) {
      console.error('入庫失敗:', err);
      toast.error(err.message || '入庫失敗');
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
          記錄入庫
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// RECORD_IN</p>
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
                <Link
                  href={`/items/new?name=${encodeURIComponent(searchQuery)}&returnTo=/record-in`}
                  className="block w-full p-4 bg-[#0a0a0a] border border-[#333333] border-dashed rounded hover:border-[#00FF41] transition-colors text-left"
                >
                  <p className="text-gray-400">
                    + 找不到？新增「{searchQuery}」
                  </p>
                </Link>
              )}
            </div>
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
                入庫數量：
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const current = parseFloat(quantity) || 0;
                      const newValue = Math.max(0, current - 0.5);
                      setQuantity(newValue.toString());
                    }}
                    className="w-16 h-16 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#FF0055] hover:bg-[rgba(255,0,85,0.1)] transition-all active:scale-95 flex items-center justify-center"
                  >
                    <span className="text-2xl text-white font-bold">−</span>
                  </button>

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
                <div className="text-center">
                  <span className="text-gray-400 font-mono text-sm">{selectedItem.unit}</span>
                </div>
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
                placeholder="例如：放置位置、注意事項等..."
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

export default function RecordInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[#00FF41] font-mono">載入中...</div>
      </div>
    }>
      <RecordInForm />
    </Suspense>
  );
}