-- 設定第一個管理員
-- 使用方法：
-- 1. 先註冊一個帳號
-- 2. 在 Supabase Dashboard > SQL Editor 執行此腳本
-- 3. 將下面的 '你的名稱' 替換成你註冊時使用的名稱

-- 方法一：透過名稱設定（推薦）
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{is_admin}',
  'true'::jsonb
)
WHERE id = (
  SELECT id
  FROM profiles
  WHERE name = 'Steven'  -- 請替換成你的名稱
);

-- 方法二：透過 Email 設定
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(
--   COALESCE(raw_user_meta_data, '{}'::jsonb),
--   '{is_admin}',
--   'true'::jsonb
-- )
-- WHERE email = 'your-email@example.com';  -- 請替換成你的 Email

-- 方法三：直接透過 User ID 設定（最直接）
-- UPDATE auth.users
-- SET raw_user_meta_data = jsonb_set(
--   COALESCE(raw_user_meta_data, '{}'::jsonb),
--   '{is_admin}',
--   'true'::jsonb
-- )
-- WHERE id = '660cbc78-288c-4049-9a0b-763bfbf48ec1';

-- 驗證是否設定成功
SELECT
  u.id,
  u.email,
  p.name,
  u.raw_user_meta_data->>'is_admin' as is_admin,
  u.raw_user_meta_data as full_metadata
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.raw_user_meta_data->>'is_admin' = 'true';
