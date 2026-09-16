-- 種子資料（依 2026/9 總表狀態）
insert into fund_storages (name, sort_order, active) values
  ('郵局', 1, true), ('現金', 2, true), ('現金（廚房）', 3, true),
  ('現金（蘭樂）', 4, true), ('現金（MT）', 5, true), ('現金（沙龍）', 6, true),
  ('代墊（待清償）', 7, true)
on conflict (name) do nothing;

insert into fund_accounts (name, kind, default_storage_id, sort_order, active) values
  ('不凍結零用金',   'main',    (select id from fund_storages where name='郵局'),       1, true),
  ('緊急應變備用金', 'reserve', (select id from fund_storages where name='郵局'),       2, true),
  ('共存前瞻預算',   'reserve', (select id from fund_storages where name='郵局'),       3, true),
  ('小組專款（沙龍）','group',  (select id from fund_storages where name='現金（沙龍）'), 4, true),
  ('小組專款（廚房）','group',  (select id from fund_storages where name='現金（廚房）'), 5, true),
  ('小組專款（蘭樂）','group',  (select id from fund_storages where name='現金（蘭樂）'), 6, true),
  ('小組專款（Maker）','group', (select id from fund_storages where name='現金（MT）'),   7, true),
  ('特殊專款（非人）','special',(select id from fund_storages where name='郵局'),       8, true),
  -- 一階曾出現、現已不用的科目（匯入舊資料時需要）
  ('特殊專款',       'special', (select id from fund_storages where name='郵局'),       20, false),
  ('特殊專款（廚）', 'special', (select id from fund_storages where name='郵局'),       21, false),
  ('特殊專款（椅）', 'special', (select id from fund_storages where name='郵局'),       22, false),
  ('特殊專款（Kody）','special',(select id from fund_storages where name='郵局'),       23, false),
  ('臨時專款（印）', 'special', (select id from fund_storages where name='郵局'),       24, false)
on conflict (name) do nothing;

insert into fund_handlers (name, sort_order) values ('艾摩爾', 1), ('Keiran', 2), ('夫夫', 3)
on conflict (name) do nothing;

-- 成員：從總表品項說明抽出；active = 2026 年後仍有奉納
insert into fund_members (nickname, real_name, role, default_last5, active, sort_order) values
  ('嚴昕',   null,     '巢穴人', '10324', true,  1),
  ('Steven', '趙哲儒', '巢穴人', '88404', true,  2),
  ('Barney', '黃嵩淵', '巢穴人', '60399', true,  3),
  ('Eason',  '王翊丞', '巢穴人', '93172', true,  4),
  ('Ryan',   '陳志翰', '巢穴人', null,    true,  5),
  ('陳臻',   null,     '巢穴人', '25961', true,  6),
  ('Lucy',   '劉怡萱', '巢穴眾', '23221', true,  7),
  ('Sim',    '沈建緯', '巢穴眾', '11901', true,  8),
  ('陳震宇', null,     '巢穴人', '28869', true,  9),
  ('Ruby',   '洪瑞綺', '巢穴人', '73465', true, 10),
  ('余昱霖', null,     '巢穴人', '71364', true, 11),
  ('YUYU',   '沈祐誠', '巢穴人', '52720', true, 12),
  ('Joy',    '簡嘉誼', '巢穴眾', '53616', true, 13),
  ('阿繁',   '陳繁皓', '巢穴眾', '16598', true, 14),
  ('阿尼',   '王合謙', '巢穴眾', '60887', true, 15),
  ('以勒',   '沈以勒', '巢穴人', '27377', true, 16),
  ('高蘋',   '高雅蘋', '巢穴眾', '35261', true, 17),
  ('Asher',  '艾希爾', '巢穴人', '00129', true, 18),
  ('陳威宇', null,     '巢穴眾', '69936', true, 19),
  ('許永霖', null,     '巢穴眾', '16141', true, 20),
  ('小八',   '吳佩姍', '外家代表', '28578', true, 21),
  ('周平',   null,     '巢穴人', null,    true, 22),
  ('柏萊赫夫夫', null, '巢穴人', null,    true, 23),
  ('Colson&懸', null,  '外家代表', null,  true, 24),
  ('阿祈',   '蕭靖祈', '外家代表', null,  true, 25),
  -- 一階成員，2025 年後未再奉納
  ('林承豪', null,     '巢穴人', '34521', false, 30),
  ('June',   '王慧君', '巢穴眾', '61600', false, 31),
  ('Bobo',   '黃柏瀚', '巢穴人', '41068', false, 32),
  ('林承翰', null,     '巢穴人', '26737', false, 33),
  ('阿曦夫', '賴冠宇', '巢穴人', '83809', false, 34),
  ('Jack',   '官大翔', '巢穴眾', '27150', false, 35),
  ('阿喆',   '王威喆', '巢穴眾', '27150', false, 36)
on conflict (nickname) do nothing;
