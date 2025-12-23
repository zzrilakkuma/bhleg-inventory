-- 建立 items 表（物品）
CREATE TABLE items (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  stock NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  is_regular_item BOOLEAN NOT NULL DEFAULT false,
  low_stock_threshold NUMERIC,
  location TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 建立 records 表（出入庫記錄）
CREATE TABLE records (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  quantity NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  stock_after NUMERIC NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 建立索引以提升查詢效能
CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_is_regular ON items(is_regular_item);
CREATE INDEX idx_items_created_at ON items(created_at);
CREATE INDEX idx_records_item_id ON records(item_id);
CREATE INDEX idx_records_created_at ON records(created_at);
CREATE INDEX idx_records_type ON records(type);

-- 啟用 Row Level Security
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

-- Items 表的 RLS policies
-- 所有已認證使用者可以讀取物品
CREATE POLICY "所有已認證使用者可以查看物品"
  ON items FOR SELECT
  TO authenticated
  USING (true);

-- 所有已認證使用者可以新增物品
CREATE POLICY "所有已認證使用者可以新增物品"
  ON items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 所有已認證使用者可以更新物品
CREATE POLICY "所有已認證使用者可以更新物品"
  ON items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 只有管理員可以刪除物品
CREATE POLICY "只有管理員可以刪除物品"
  ON items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'is_admin')::boolean = true
    )
  );

-- Records 表的 RLS policies
-- 所有已認證使用者可以讀取記錄
CREATE POLICY "所有已認證使用者可以查看記錄"
  ON records FOR SELECT
  TO authenticated
  USING (true);

-- 所有已認證使用者可以新增記錄
CREATE POLICY "所有已認證使用者可以新增記錄"
  ON records FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 只有管理員可以刪除記錄
CREATE POLICY "只有管理員可以刪除記錄"
  ON records FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (auth.users.raw_user_meta_data->>'is_admin')::boolean = true
    )
  );

-- 建立 updated_at 自動更新的 trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
