-- 009：帳頁用 view（交易 + 快照 + 支出／奉納附加欄位）。可重複執行。必須在 008 之後套用。

drop view if exists fund_ledger_rows;

create view fund_ledger_rows as
select o.*,
       s.total, s.main, s.accounts, s.storages,
       e.claim_status, e.vendor, e.tags,
       d.member_id,
       (select coalesce(sum(l.amount) filter (where l.amount > 0), 0) from fund_lines l where l.transaction_id = o.id) as moved
from fund_tx_ordered o
join fund_tx_snapshots s on s.transaction_id = o.id
left join fund_expenses e on e.transaction_id = o.id
left join fund_donations d on d.transaction_id = o.id;

alter view fund_ledger_rows set (security_invoker = on);
grant select on fund_ledger_rows to authenticated;

select fund_apply_policies();
