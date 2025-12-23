'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

export default function RecordInPage() {
  const searchParams = useSearchParams();
  const itemIdFromUrl = searchParams.get('itemId');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);

  // 載入物品列表（從 localStorage + 模擬資料）
  useEffect(() => {
    const mockItems = [
      { id: 1, name: '醬油（龜甲萬 500ml）', unit: '瓶', stock: 3, category: '食材' },
      { id: 2, name: '醬油（金蘭 1L）', unit: '瓶', stock: 2, category: '食材' },
      { id: 3, name: '白米（池上米）', unit: '包', stock: 5, category: '食材' },
    ];

    // 從 localStorage 讀取使用者新增的物品
    const storedItems = JSON.parse(localStorage.getItem('items') || '[]');

    // 合併模擬資料和使用者新增的物品
    const items = [...mockItems, ...storedItems];
    setAllItems(items);

    // 如果 URL 中有 itemId，自動選擇該物品
    if (itemIdFromUrl) {
      const item = items.find(i => i.id === Number(itemIdFromUrl));
      if (item) {
        setSelectedItem(item);
      }
    }
  }, [itemIdFromUrl]);

  const filteredItems = allItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // 轉換圖片為 base64 預覽（之後會上傳到雲端）
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!selectedItem || !quantity) {
      toast.error('請選擇物品並輸入數量');
      return;
    }

    const inQuantity = Number(quantity);

    // 更新 localStorage 中的庫存
    const storedItems = JSON.parse(localStorage.getItem('items') || '[]');
    const itemIndex = storedItems.findIndex((item: any) => item.id === selectedItem.id);

    if (itemIndex !== -1) {
      // 更新使用者新增的物品
      storedItems[itemIndex].stock = (storedItems[itemIndex].stock || 0) + inQuantity;
      storedItems[itemIndex].updatedAt = new Date().toISOString();
      localStorage.setItem('items', JSON.stringify(storedItems));
    }

    // 儲存入庫記錄
    const records = JSON.parse(localStorage.getItem('records') || '[]');
    records.unshift({
      id: Date.now(),
      type: 'in',
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      quantity: inQuantity,
      unit: selectedItem.unit,
      note,
      images,
      timestamp: new Date().toISOString(),
      user: '訪客',
    });
    localStorage.setItem('records', JSON.stringify(records));

    toast.success(`成功記錄入庫：${selectedItem.name} +${quantity} ${selectedItem.unit}`);

    // 清空表單
    setSearchQuery('');
    setSelectedItem(null);
    setQuantity('');
    setNote('');
    setImages([]);

    // 重新載入物品列表
    const mockItems = [
      { id: 1, name: '醬油（龜甲萬 500ml）', unit: '瓶', stock: 3, category: '食材' },
      { id: 2, name: '醬油（金蘭 1L）', unit: '瓶', stock: 2, category: '食材' },
      { id: 3, name: '白米（池上米）', unit: '包', stock: 5, category: '食材' },
    ];
    const updatedStoredItems = JSON.parse(localStorage.getItem('items') || '[]');
    setAllItems([...mockItems, ...updatedStoredItems]);
  };

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
                  {/* 減少按鈕 */}
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

            {/* 拍照/上傳圖片 */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 font-mono">
                照片（選填）：
              </label>

              {/* 上傳按鈕 */}
              <label className="block w-full p-4 bg-[#0a0a0a] border border-[#333333] border-dashed rounded hover:border-[#00FF41] transition-colors cursor-pointer text-center">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl">📷</span>
                  <span className="text-sm text-gray-400 font-mono">
                    點擊拍照或上傳圖片
                  </span>
                </div>
              </label>

              {/* 圖片預覽 */}
              {images.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {images.map((image, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={image}
                        alt={`預覽 ${index + 1}`}
                        className="w-full h-full object-cover rounded border border-[#333333]"
                      />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-[#FF0055] rounded-full flex items-center justify-center text-white text-xs hover:bg-[#ff0077] transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 送出按鈕 */}
            <button
              onClick={handleSubmit}
              className="w-full py-4 bg-gradient-to-br from-[rgba(0,255,65,0.2)] to-transparent border border-[#00FF41] rounded hover:from-[rgba(0,255,65,0.3)] transition-all duration-200 text-[#00FF41] font-semibold"
              style={{
                boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)'
              }}
            >
              確認送出
            </button>
          </>
        )}
      </main>
    </div>
  );
}
