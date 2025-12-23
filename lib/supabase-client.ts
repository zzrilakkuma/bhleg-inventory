import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// TypeScript 型別定義
export interface Item {
  id: number;
  name: string;
  category: string;
  stock: number;
  unit: string;
  is_regular_item: boolean;
  low_stock_threshold?: number;
  location?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Record {
  id: number;
  item_id: number;
  type: 'in' | 'out';
  quantity: number;
  reason: string;
  stock_after: number;
  image_urls?: string[]; // 新增此欄位
  created_by?: string;
  created_at: string;
}

// 輔助函式：處理圖片上傳
export const uploadImages = async (bucket: string, imagesBase64: string[]) => {
  const uploadPromises = imagesBase64.map(async (base64, index) => {
    // 移除 base64 前綴並轉為 ArrayBuffer
    const response = await fetch(base64);
    const blob = await response.blob();
    
    const fileName = `${Date.now()}_${index}.jpg`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // 取得公開 URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrl;
  });

  return Promise.all(uploadPromises);
};

// 物品相關 API
export const itemsApi = {
  async getAll() {
    const { data, error } = await supabase
      .from('items')
      .select(`
        *,
        records (
          reason,
          created_at
        )
      `)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // 處理資料，為每個物品提取最新的一筆記錄備註
    const itemsWithLastNote = (data as any[]).map(item => ({
      ...item,
      last_record: item.records && item.records.length > 0 
        ? item.records.sort((a: any, b: any) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0]
        : null
    }));

    return itemsWithLastNote;
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Item;
  },

  async create(item: Omit<Item, 'id' | 'created_at' | 'updated_at' | 'created_by'>) {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('items')
      .insert({ ...item, created_by: userData.user?.id })
      .select()
      .single();
    if (error) throw error;
    return data as Item;
  },

  async update(id: number, updates: Partial<Item>) {
    const { data, error } = await supabase
      .from('items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Item;
  }
};

// 記錄相關 API
export const recordsApi = {
  async getAll() {
    const { data, error } = await supabase
      .from('records')
      .select(`
        *,
        items (id, name, category, unit),
        operator:profiles!created_by (name)
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getById(id: number) {
    const { data, error } = await supabase
      .from('records')
      .select(`
        *,
        items (id, name, category, unit, stock),
        operator:profiles!created_by (name)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

    async getByItemId(itemId: number) {

      const { data, error } = await supabase

        .from('records')

        .select(`

          *,

          operator:profiles!created_by (name)

        `)

        .eq('item_id', itemId)

        .order('created_at', { ascending: false });

  

      if (error) throw error;

      return data as any[];

    },

  async create(record: Omit<Record, 'id' | 'created_at' | 'created_by' | 'stock_after'>) {
    const { data: userData } = await supabase.auth.getUser();

    const { data: item, error: itemError } = await supabase
      .from('items')
      .select('stock')
      .eq('id', record.item_id)
      .single();
    if (itemError) throw itemError;

    const newStock = record.type === 'in'
      ? item.stock + record.quantity
      : item.stock - record.quantity;

    if (newStock < 0) throw new Error('庫存不足');

    const { data: newRecord, error: recordError } = await supabase
      .from('records')
      .insert({
        ...record,
        stock_after: newStock,
        created_by: userData.user?.id
      })
      .select()
      .single();

    if (recordError) throw recordError;

    await supabase
      .from('items')
      .update({ stock: newStock })
      .eq('id', record.item_id);

    return newRecord as Record;
  }
};