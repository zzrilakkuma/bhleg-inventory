'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// 類別定義
const CATEGORIES = [
  '廚房',
  '沙龍（日用品）',
  '神室（信仰）',
  '藝廊（展覽）',
  '中央蘭室（成員）',
  '倉庫（maker、硬體）',
];

type SortOption = 'updated' | 'stock';

export default function InventoryPage() {
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegularItemsOnly, setShowRegularItemsOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [allItems, setAllItems] = useState<any[]>([]);

  // 載入物品列表（從 localStorage + 模擬資料）
  useEffect(() => {
    const mockItems = [
      { id: 1, name: '醬油（龜甲萬 500ml）', unit: '瓶', stock: 3, category: '廚房', isRegularItem: true, updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      { id: 2, name: '醬油（金蘭 1L）', unit: '瓶', stock: 2, category: '廚房', isRegularItem: false, updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
      { id: 3, name: '白米（池上米）', unit: '包', stock: 0, category: '廚房', isRegularItem: true, updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
    ];

    // 從 localStorage 讀取使用者新增的物品
    const storedItems = JSON.parse(localStorage.getItem('items') || '[]');

    // 合併模擬資料和使用者新增的物品
    setAllItems([...mockItems, ...storedItems]);
  }, []);

  // 篩選邏輯
  const filteredItems = allItems
    .filter(item => {
      // 類別篩選
      if (item.category !== selectedCategory) return false;

      // 搜尋篩選
      if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;

      // 常態性備品篩選
      if (showRegularItemsOnly && !item.isRegularItem) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'updated') {
        // 按最後更新時間排序（較新的在前）
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      } else {
        // 按庫存量排序（較少的在前）
        return a.stock - b.stock;
      }
    });

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

  // 根據門檻判斷庫存狀態
  const getStockStatus = (item: any) => {
    const { stock, warningThreshold, criticalThreshold } = item;

    // 如果沒有設定門檻，使用預設邏輯
    if (warningThreshold === null || criticalThreshold === null) {
      if (stock === 0) return 'critical'; // 🔴 紅色
      return 'sufficient'; // 🟢 綠色
    }

    // 有設定門檻，按照三級制判斷
    if (stock <= criticalThreshold) return 'critical'; // 🔴 待補充
    if (stock <= warningThreshold) return 'warning';   // 🟡 須留意
    return 'sufficient'; // 🟢 充足
  };

  // 根據狀態回傳顏色
  const getStockColor = (status: string) => {
    if (status === 'critical') return 'text-[#FF0055]'; // 紅色
    if (status === 'warning') return 'text-[#FFFF00]';  // 黃色
    return 'text-[#00FF41]'; // 綠色
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
          查看庫存
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// VIEW_INVENTORY</p>
      </header>

      <main className="w-full max-w-2xl mx-auto space-y-6">
        {/* 搜尋框 */}
        <div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 搜尋物品名稱..."
            className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono"
            style={{
              caretColor: '#00FF41'
            }}
          />
        </div>

        {/* 類別篩選 */}
        <div>
          <p className="text-xs text-gray-500 mb-2 font-mono">類別篩選：</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded border transition-all font-mono text-sm ${
                  selectedCategory === cat
                    ? 'border-[#00FF41] bg-[rgba(0,255,65,0.1)] text-[#00FF41]'
                    : 'border-[#333333] bg-[#0a0a0a] text-gray-400 hover:border-[#00FF41] hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 快速篩選 */}
        <div>
          <button
            onClick={() => setShowRegularItemsOnly(!showRegularItemsOnly)}
            className={`px-4 py-2 rounded border transition-all font-mono text-sm ${
              showRegularItemsOnly
                ? 'border-[#00FF41] bg-[rgba(0,255,65,0.1)] text-[#00FF41]'
                : 'border-[#333333] bg-[#0a0a0a] text-gray-400 hover:border-[#00FF41] hover:text-white'
            }`}
          >
            僅顯示常態性備品
          </button>
        </div>

        {/* 排序選項 */}
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500 font-mono">排序：</p>
          <button
            onClick={() => setSortBy('updated')}
            className={`px-3 py-2 rounded border transition-all font-mono text-xs ${
              sortBy === 'updated'
                ? 'border-[#00FF41] bg-[rgba(0,255,65,0.1)] text-[#00FF41]'
                : 'border-[#333333] bg-[#0a0a0a] text-gray-400 hover:border-[#00FF41] hover:text-white'
            }`}
          >
            最後更新
          </button>
          <button
            onClick={() => setSortBy('stock')}
            className={`px-3 py-2 rounded border transition-all font-mono text-xs ${
              sortBy === 'stock'
                ? 'border-[#00FF41] bg-[rgba(0,255,65,0.1)] text-[#00FF41]'
                : 'border-[#333333] bg-[#0a0a0a] text-gray-400 hover:border-[#00FF41] hover:text-white'
            }`}
          >
            庫存量
          </button>
        </div>

        {/* 物品列表 */}
        <div className="space-y-3">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <Link
                key={item.id}
                href={`/inventory/${item.id}`}
                className="block p-4 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] transition-colors"
              >
                <div className="mb-2">
                  <p className="text-white font-medium">
                    {item.isRegularItem && <span className="mr-2">📌</span>}
                    {item.name}
                  </p>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 text-gray-500 font-mono">
                    <span>{item.category}</span>
                    <span>|</span>
                    <span className={getStockColor(getStockStatus(item))}>
                      {item.stock} {item.unit}
                    </span>
                  </div>
                  <span className="text-xs text-gray-600 font-mono">
                    {getRelativeTime(item.updatedAt || item.createdAt)}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="p-8 text-center border border-[#333333] border-dashed rounded">
              <p className="text-gray-500 font-mono">
                {searchQuery ? `找不到「${searchQuery}」` : '此類別暫無物品'}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
