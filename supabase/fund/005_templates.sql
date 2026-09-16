-- 常用模板：固定帳單、標籤組合
create table if not exists fund_templates (
  id            serial primary key,
  name          text not null unique,
  kind          text not null default 'expense' check (kind in ('expense','tags')),
  vendor        text,
  description   text,
  tags          text[] not null default '{}',
  storage_name  text,        -- 郵局 / 現金
  advancer_name text,        -- 信用卡 / 中央蘭室
  default_amount numeric(12,0),
  active        boolean not null default true,
  sort_order    int not null default 0
);
alter table fund_templates enable row level security;
drop policy if exists "fund_templates_authenticated_all" on fund_templates;
create policy "fund_templates_authenticated_all" on fund_templates for all to authenticated using (true) with check (true);

insert into fund_templates (name, kind, vendor, description, tags, storage_name, default_amount, sort_order) values
  ('電費',       'expense', '台灣電力公司',           '巢穴 N月份 電費',   '{巢穴,經常性基本開銷,電費}',   '郵局', null,  1),
  ('水費',       'expense', '臺北自來水事業處',       '巢穴 N月份 水費',   '{巢穴,經常性基本開銷,水費}',   '郵局', null,  2),
  ('電信費',     'expense', '中華電信股份有限公司',   '巢穴 N月份 電信費', '{巢穴,經常性基本開銷,電信費}', '郵局', null,  3),
  ('華南貸款',   'expense', '華南 貸款',              'N月份',             '{巢穴,經常性基本開銷,貸款}',   '郵局', 17434, 4),
  ('國泰貸款',   'expense', '國泰 貸款',              'N月份',             '{巢穴,經常性基本開銷,貸款}',   '郵局', 5453,  5),
  ('中央蘭室專款','expense','中央蘭室專款',           'N月份',             '{中央蘭室,經常性基本開銷}',   '郵局', 15000, 6),
  ('停車場月租', 'expense', '悠勢科技股份有限公司 USPACE', '汽車（Olly）停車場 月租費', '{巢穴,共用汽車,停車費}', '現金', 3800, 7),
  ('油料費',     'expense', '台灣中油',               '汽車（Olly）油料費', '{巢穴,共用汽車,油料費}',      '現金', null,  8),
  ('固定聚會食材','expense','大全聯',                 'N月固定聚會食材成本','{巢穴,固定聚會成本}',        '現金', null,  9),
  ('日常耗品',   'tags',    null, null, '{巢穴,耗品,日常用品}',        null, null, 20),
  ('沙龍日常',   'tags',    null, null, '{沙龍,日常開銷}',             null, null, 21),
  ('拜拜',       'tags',    null, null, '{巢穴,儀式,拜拜用品}',        null, null, 22)
on conflict (name) do nothing;
