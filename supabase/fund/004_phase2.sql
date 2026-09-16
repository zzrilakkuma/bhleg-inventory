-- 第二階段：代墊、支出明細、借款還款、結算、標籤

update fund_storages set name = '代墊（待清償）' where name = '信用卡（待清償）';

create table if not exists fund_advancers (      -- 代墊者
  id         serial primary key,
  name       text not null unique,
  active     boolean not null default true,
  sort_order int not null default 0
);
insert into fund_advancers (name, sort_order) values ('信用卡', 1), ('中央蘭室', 2)
on conflict (name) do nothing;

create table if not exists fund_tags (           -- 支出標籤
  id         serial primary key,
  name       text not null unique,
  "group"    text not null check ("group" in ('space','nature','item')),
  active     boolean not null default true,
  sort_order int not null default 0
);
insert into fund_tags (name, "group", sort_order) values
  ('巢穴','space',1),('沙龍','space',2),('共營空間','space',3),('中央蘭室','space',4),('共享廚房','space',5),('藝廊','space',6),
  ('經常性基本開銷','nature',1),('固定聚會成本','nature',2),('耗品','nature',3),('日常用品','nature',4),('儀式','nature',5),
  ('訂閱費','nature',6),('醫療費用','nature',7),('共同債務','nature',8),('共用汽車','nature',9),('非人動物成員','nature',10),
  ('電費','item',1),('水費','item',2),('電信費','item',3),('油料費','item',4),('停車費','item',5),('菸草','item',6),('菸具','item',7),
  ('狗飼料','item',8),('咖啡豆','item',9),('瓦斯','item',10),('拜拜用品','item',11),('貢品','item',12),('洗衣烘衣','item',13),
  ('貸款','item',14),('日常開銷','item',15),('蠟燭','item',16),('盥洗用品','item',17)
on conflict (name) do nothing;

create table if not exists fund_expenses (
  id             bigserial primary key,
  transaction_id bigint not null unique references fund_transactions(id) on delete cascade,
  vendor         text,
  description    text,
  voucher_no     text,
  tags           text[] not null default '{}',
  advancer_id    int references fund_advancers(id),
  settled        boolean not null default false     -- 代墊是否已清償
);

create table if not exists fund_loans (
  id             bigserial primary key,
  transaction_id bigint not null unique references fund_transactions(id) on delete cascade,
  lender_name    text not null,
  principal      numeric(12,0) not null,
  note           text
);

create table if not exists fund_repayments (
  id             bigserial primary key,
  transaction_id bigint not null unique references fund_transactions(id) on delete cascade,
  loan_id        bigint not null references fund_loans(id) on delete cascade,
  amount         numeric(12,0) not null,           -- 本金部分
  fee            numeric(12,0) not null default 0
);

create table if not exists fund_settlements (
  id             bigserial primary key,
  transaction_id bigint not null unique references fund_transactions(id) on delete cascade,
  month          text not null,                    -- 'YYYY-MM'
  actual_post    numeric(12,0),                    -- 實際郵局餘額
  actual_cash    numeric(12,0),                    -- 實際現金袋餘額
  system_post    numeric(12,0),
  system_cash    numeric(12,0)
);

alter table fund_advancers   enable row level security;
alter table fund_tags        enable row level security;
alter table fund_expenses    enable row level security;
alter table fund_loans       enable row level security;
alter table fund_repayments  enable row level security;
alter table fund_settlements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fund_advancers','fund_tags','fund_expenses','fund_loans','fund_repayments','fund_settlements'] loop
    execute format('drop policy if exists "%s_authenticated_all" on %I', t, t);
    execute format('create policy "%s_authenticated_all" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
