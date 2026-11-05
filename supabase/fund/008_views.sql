-- 008：餘額快照與期間統計 view。可重複執行。必須在 001–007 之後套用。
-- 演算法與 lib/fund.ts#computeRunningBalances 一致：依 occurred_on, seq, id 排序，累加所有 fund_lines。

drop view if exists fund_period_summary, fund_periods, fund_tx_snapshots, fund_tx_ordered, fund_outstanding_loans, fund_advances_owed, fund_waived_total cascade;

create index if not exists fund_lines_tx_idx on fund_lines(transaction_id);

create or replace view fund_tx_ordered as
select t.*,
       row_number() over (order by t.occurred_on, t.seq, t.id) as ord
from fund_transactions t;

-- 每筆交易後的累計餘額。以視窗累加（O(n·k)，k = 有明細的科目／存放位置數）：
-- 交易 × 科目（存放位置）的稠密格，左接該交易在該科目的淨額，依 ord 累加；
-- 只輸出在該列（含）之前出現過明細的科目／存放位置。沒有明細的交易沿用前一列的累計。
create or replace view fund_tx_snapshots as
with tx_acc as (
  select transaction_id, account_id, sum(amount) as amt from fund_lines group by 1, 2
),
tx_sto as (
  select transaction_id, storage_id, sum(amount) as amt from fund_lines group by 1, 2
),
acc_grid as (
  select o.id, a.account_id,
         sum(coalesce(x.amt, 0)) over w as bal,
         count(x.amt) over w as n
  from fund_tx_ordered o
  cross join (select distinct account_id from fund_lines) a
  left join tx_acc x on x.transaction_id = o.id and x.account_id = a.account_id
  window w as (partition by a.account_id order by o.ord)
),
sto_grid as (
  select o.id, s.storage_id,
         sum(coalesce(x.amt, 0)) over w as bal,
         count(x.amt) over w as n
  from fund_tx_ordered o
  cross join (select distinct storage_id from fund_lines) s
  left join tx_sto x on x.transaction_id = o.id and x.storage_id = s.storage_id
  window w as (partition by s.storage_id order by o.ord)
),
acc as (
  select id,
         sum(bal) as total,
         sum(bal) filter (where account_id = (select id from fund_accounts where kind = 'main' limit 1)) as main,
         jsonb_object_agg(account_id::text, bal) filter (where n > 0) as accounts
  from acc_grid group by id
),
sto as (
  select id, jsonb_object_agg(storage_id::text, bal) filter (where n > 0) as storages
  from sto_grid group by id
)
select o.id as transaction_id,
       o.ord,
       o.occurred_on,
       coalesce(a.total, 0) as total,
       coalesce(a.main, 0) as main,
       coalesce(a.accounts, '{}'::jsonb) as accounts,
       coalesce(s.storages, '{}'::jsonb) as storages
from fund_tx_ordered o
left join acc a on a.id = o.id
left join sto s on s.id = o.id;

create or replace view fund_periods as
select st.transaction_id as settlement_transaction_id,
       st.month,
       st.period_no,
       coalesce(lag(o.ord) over (order by o.ord), 0) + 1 as start_ord,
       o.ord as end_ord,
       coalesce(o.stated_on, o.occurred_on) as settled_on
from fund_settlements st
join fund_tx_ordered o on o.id = st.transaction_id;

create or replace view fund_period_summary as
select p.month,
       p.period_no,
       p.settled_on,
       e.total as end_total,
       e.main as end_main,
       (select min(sn.main) from fund_tx_snapshots sn
         where sn.ord between p.start_ord and p.end_ord) as min_main,
       coalesce((select jsonb_object_agg(k, v) from (
                   select coalesce(t.income_source, 'other') as k, sum(t.amount) as v
                   from fund_tx_ordered t
                   where t.ord between p.start_ord and p.end_ord
                     and t.type in ('donation','income','refund','loan')
                     and t.amount > 0
                     and not t.off_ledger
                   group by 1) i), '{}'::jsonb) as income_by_source,
       coalesce((select jsonb_object_agg(g, v) from (
                   select c.g, sum(c.amt) as v from (
                     select -t.amount as amt,
                            case when t.type = 'repayment' then '貸款與信用卡'
                                 else coalesce((
                                   select ft.report_group
                                   from fund_expenses fe
                                   cross join lateral unnest(fe.tags) with ordinality as u(tag, idx)
                                   join fund_tags ft on ft.name = u.tag and ft.report_group is not null
                                   where fe.transaction_id = t.id
                                   order by ft.sort_order, u.idx
                                   limit 1), '其他') end as g
                     from fund_tx_ordered t
                     where t.ord between p.start_ord and p.end_ord
                       and t.type in ('expense','expense_claim','repayment')
                       and not t.off_ledger
                   ) c group by c.g) x), '{}'::jsonb) as expense_by_group,
       coalesce((select sum(t.amount) from fund_tx_ordered t
                  where t.ord between p.start_ord and p.end_ord
                    and t.income_source = 'salon' and not t.off_ledger), 0) as salon_income
from fund_periods p
join fund_tx_snapshots e on e.ord = p.end_ord;

create or replace view fund_outstanding_loans as
select l.id as loan_id,
       l.lender_name,
       l.lender_member_id,
       l.principal,
       coalesce(r.repaid, 0) as repaid,
       l.principal - coalesce(r.repaid, 0) as remaining,
       l.status
from fund_loans l
left join (select loan_id, sum(amount) as repaid from fund_repayments group by loan_id) r
  on r.loan_id = l.id;

create or replace view fund_advances_owed as
select fe.advancer_id,
       a.name as advancer_name,
       sum(-t.amount) as amount
from fund_expenses fe
join fund_transactions t on t.id = fe.transaction_id
left join fund_advancers a on a.id = fe.advancer_id
where fe.claim_status = 'unclaimed'
group by fe.advancer_id, a.name;

create or replace view fund_waived_total as
select coalesce(sum(-t.amount), 0) as total
from fund_expenses fe
join fund_transactions t on t.id = fe.transaction_id
where fe.claim_status = 'waived';

do $$
declare v text;
begin
  foreach v in array array['fund_tx_ordered','fund_tx_snapshots','fund_periods','fund_period_summary',
                           'fund_outstanding_loans','fund_advances_owed','fund_waived_total'] loop
    execute format('alter view %I set (security_invoker = on)', v);
    execute format('grant select on %I to authenticated', v);
  end loop;
end $$;

select fund_apply_policies();
