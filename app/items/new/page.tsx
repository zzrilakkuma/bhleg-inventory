'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { itemsApi, recordsApi, uploadImages } from '@/lib/supabase-client';

// 類別定義
const CATEGORIES = [
  '廚房',
  '沙龍（日用品）',
  '神室（信仰）',
  '藝廊（展覽）',
  '中央蘭室（成員）',
  '倉庫（maker、硬體）',
];

// 常用單位
const COMMON_UNITS = [
  '瓶', '包', '罐', '個',
  '串', '組', 'kg', 'L',
];

function NewItemForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 從 URL 取得預填資料
  const prefilledName = searchParams.get('name') || '';
  const returnTo = searchParams.get('returnTo') || '/';

  const [name, setName] = useState(prefilledName);
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [initialStock, setInitialStock] = useState('1');
  const [isRegularItem, setIsRegularItem] = useState(false);
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);

  // 處理圖片上傳
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // 限制最多 5 張照片
    if (images.length + files.length > 5) {
      toast.error('最多只能上傳 5 張照片');
      return;
    }

    Array.from(files).forEach((file) => {
      // 限制檔案大小 5MB
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

  // 移除圖片
  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // 驗證必填欄位
    if (!name.trim()) {
      toast.error('請輸入物品名稱');
      return;
    }
    if (!category) {
      toast.error('請選擇類別');
      return;
    }
    if (!unit.trim()) {
      toast.error('請輸入單位');
      return;
    }

    try {
      // 如果有圖片，先處理上傳
      let imageUrls: string[] = [];
      if (images.length > 0) {
        toast.loading('正在上傳圖片...', { id: 'uploading' });
        imageUrls = await uploadImages('record-images', images);
        toast.dismiss('uploading');
      }

      // 建立新物品
      const newItem = await itemsApi.create({
        name,
        category,
        unit,
        stock: 0, 
        is_regular_item: isRegularItem,
        notes: note || undefined,
      });

      // 如果初始庫存大於 0，建立初始入庫記錄（包含圖片連結）
      if (Number(initialStock) > 0) {
        await recordsApi.create({
          item_id: newItem.id,
          type: 'in',
          quantity: Number(initialStock),
          reason: note || '初始建立',
          image_urls: imageUrls, // 這裡將圖片連結存入紀錄
        } as any);
      }

      toast.success(`成功新增物品：${name}`);

      // 返回上一頁或指定頁面
      router.push(returnTo);
    } catch (error) {
      console.error('新增物品失敗:', error);
      toast.error('新增物品失敗，請稍後再試');
    }
  };

  return (
    <div className="flex min-h-screen flex-col px-6 py-8">
      {/* Header */}
      <header className="mb-8">
        <Link
          href={returnTo}
          className="inline-block text-sm text-gray-500 hover:text-[#00FF41] transition-colors font-mono mb-4"
        >
          ← 返回
        </Link>
        <h1 className="text-2xl font-bold text-[#00FF41]" style={{
          textShadow: '0 0 10px rgba(0, 255, 65, 0.3)'
        }}>
          新增物品
        </h1>
        <p className="text-sm text-gray-500 font-mono mt-1">// ADD_ITEM</p>
      </header>

      <main className="w-full max-w-md mx-auto space-y-6">
        {/* 物品名稱 */}
        <div>
          <label className="block text-sm text-gray-400 mb-2 font-mono">
            物品名稱：<span className="text-[#FF0055]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：醬油（龜甲萬 500ml）"
            className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono"
            style={{
              caretColor: '#00FF41'
            }}
          />
        </div>

        {/* 類別選擇 */}
        <div>
          <label className="block text-sm text-gray-400 mb-3 font-mono">
            類別：<span className="text-[#FF0055]">*</span>
          </label>
          <div className="space-y-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`w-full p-3 rounded border transition-all text-left ${
                  category === cat
                    ? 'border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent'
                    : 'border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-mono">{cat}</span>
                  {category === cat && (
                    <span className="text-[#00FF41] text-sm">✓</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 初始庫存 */}
        <div>
          <label className="block text-sm text-gray-400 mb-3 font-mono">
            初始庫存：
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {/* 減少按鈕 */}
              <button
                onClick={() => {
                  const current = parseFloat(initialStock) || 0;
                  const newValue = Math.max(0, current - 0.5);
                  setInitialStock(newValue.toString());
                }}
                className="w-16 h-16 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#FF0055] hover:bg-[rgba(255,0,85,0.1)] transition-all active:scale-95 flex items-center justify-center"
              >
                <span className="text-2xl text-white font-bold">−</span>
              </button>

              {/* 數量顯示 */}
              <div className="flex-1">
                <input
                  type="number"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
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
                  const current = parseFloat(initialStock) || 0;
                  const newValue = current + 0.5;
                  setInitialStock(newValue.toString());
                }}
                className="w-16 h-16 bg-[#0a0a0a] border border-[#333333] rounded hover:border-[#00FF41] hover:bg-[rgba(0,255,65,0.1)] transition-all active:scale-95 flex items-center justify-center"
              >
                <span className="text-2xl text-[#00FF41] font-bold">+</span>
              </button>
            </div>
            {/* 單位顯示 */}
            {unit && (
              <div className="text-center">
                <span className="text-gray-400 font-mono text-sm">{unit}</span>
              </div>
            )}
          </div>
        </div>

        {/* 單位 */}
        <div>
          <label className="block text-sm text-gray-400 mb-2 font-mono">
            單位：<span className="text-[#FF0055]">*</span>
          </label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="請選擇或自行輸入"
            className="w-full px-4 py-3 bg-[#0a0a0a] border border-[#333333] rounded text-white placeholder-gray-600 focus:outline-none focus:border-[#00FF41] transition-colors font-mono"
            style={{
              caretColor: '#00FF41'
            }}
          />

          {/* 快選標籤 */}
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-2 font-mono">快選：</p>
            <div className="flex flex-wrap gap-2">
              {COMMON_UNITS.map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`px-3 py-2 rounded border transition-all font-mono text-sm ${
                    unit === u
                      ? 'border-[#00FF41] bg-[rgba(0,255,65,0.1)] text-[#00FF41]'
                      : 'border-[#333333] bg-[#0a0a0a] text-gray-400 hover:border-[#00FF41] hover:text-white'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 常態性備品 */}
        <div>
          <label className="block text-sm text-gray-400 mb-3 font-mono">
            物品性質：
          </label>
          <button
            onClick={() => setIsRegularItem(!isRegularItem)}
            className={`w-full p-4 rounded border transition-all text-left ${
              isRegularItem
                ? 'border-[#00FF41] bg-gradient-to-br from-[rgba(0,255,65,0.1)] to-transparent'
                : 'border-[#333333] bg-[#0a0a0a] hover:border-[#00FF41]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-white font-mono">常態性備品</span>
                <p className="text-xs text-gray-500 mt-1">需要長期穩定供應的物品</p>
              </div>
              <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                isRegularItem ? 'border-[#00FF41] bg-[#00FF41]' : 'border-[#333333]'
              }`}>
                {isRegularItem && (
                  <span className="text-black text-sm font-bold">✓</span>
                )}
              </div>
            </div>
          </button>
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

          {/* 照片預覽 */}
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

          {/* 上傳按鈕 */}
          {images.length < 5 && (
            <label className="block w-full p-4 border-2 border-dashed border-[#333333] rounded hover:border-[#00FF41] transition-colors cursor-pointer">
              <div className="text-center">
                <span className="text-gray-500 font-mono text-sm">
                  📷 點擊上傳照片
                </span>
                <p className="text-xs text-gray-600 mt-1 font-mono">
                  支援 JPG、PNG，單檔小於 5MB
                </p>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
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
          確認新增
        </button>
      </main>
    </div>
  );
}

export default function NewItemPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-[#00FF41] font-mono">載入中...</div>
      </div>
    }>
      <NewItemForm />
    </Suspense>
  );
}
