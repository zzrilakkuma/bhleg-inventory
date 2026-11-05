-- 巢穴共同體 公基金 帳本 schema
-- 在 Supabase SQL Editor 執行。所有表都以 fund_ 開頭，與物資流的表分開。

create table if not exists fund_members (
  id            serial primary key,
  nickname      text not null unique,          -- 暱稱（總表用的名字）
  real_name     text,                          -- 本名
  role          text check (role in ('巢穴人','巢穴眾','外家代表')),
  default_last5 text,                          -- 匯款帳號末五碼預填
  active        boolean not null default true, -- 是否在籍
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists fund_handlers (      -- 現金經手人
  id         serial primary key,
  name       text not null unique,
  active     boolean not null default true,
  sort_order int not null default 0
);

create table if not exists fund_storages (      -- 存放位置
  id         serial primary key,
  name       text not null unique,
  active     boolean not null default true,
  sort_order int not null default 0
);

create table if not exists fund_accounts (      -- 科目
  id                 serial primary key,
  name               text not null unique,
  kind               text not null default 'special' check (kind in ('main','reserve','group','special')),
  default_storage_id int references fund_storages(id),
  active             boolean not null default true,
  sort_order         int not null default 0
);

create table if not exists fund_transactions (
  id           bigserial primary key,
  type         text not null check (type in (
                 'donation','income','expense','loan','repayment','refund',
                 'transfer','settlement','opening','group_summary','reset')),
  occurred_on  date not null,
  seq          int not null default 0,          -- 同一天內的排序
  title        text not null,                   -- 品項說明
  voucher      text,                            -- 憑證
  note         text,                            -- 備註（hashtag）
  comment      text,                            -- 留言與其他備註
  amount       numeric(12,0) not null,          -- 正＝流入，負＝流出，轉帳為 0
  source       text not null default 'admin' check (source in ('form','admin','import')),
  import_row   int,                             -- 匯入時對應總表列號
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists fund_transactions_order_idx on fund_transactions (occurred_on, seq, id);

-- 每筆交易的明細：把 amount 放進某科目、某存放位置（有正負）
create table if not exists fund_lines (
  id             bigserial primary key,
  transaction_id bigint not null references fund_transactions(id) on delete cascade,
  account_id     int not null references fund_accounts(id),
  storage_id     int not null references fund_storages(id),
  amount         numeric(12,0) not null,
  label          text                              -- 例如「共享廚房常備專用款」
);
create index if not exists fund_lines_tx_idx on fund_lines (transaction_id);

-- 奉納專屬資訊
create table if not exists fund_donations (
  id              bigserial primary key,
  transaction_id  bigint not null unique references fund_transactions(id) on delete cascade,
  member_id       int not null references fund_members(id),
  payer_member_id int references fund_members(id),       -- 代繳者
  payment_method  text not null check (payment_method in ('transfer','cash')),
  last5           text,
  handler_id      int references fund_handlers(id),
  months          text[] not null default '{}',          -- 涵蓋月份 'YYYY-MM'
  message         text,
  submitted_at    timestamptz not null default now()
);
create index if not exists fund_donations_member_idx on fund_donations (member_id);

-- RLS：登入者可讀寫；匿名不可。公開表單走 API route（service role）。
alter table fund_members      enable row level security;
alter table fund_handlers     enable row level security;
alter table fund_storages     enable row level security;
alter table fund_accounts     enable row level security;
alter table fund_transactions enable row level security;
alter table fund_lines        enable row level security;
alter table fund_donations    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['fund_members','fund_handlers','fund_storages','fund_accounts','fund_transactions','fund_lines','fund_donations'] loop
    execute format('drop policy if exists "%s_authenticated_all" on %I', t, t);
    execute format('create policy "%s_authenticated_all" on %I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;
