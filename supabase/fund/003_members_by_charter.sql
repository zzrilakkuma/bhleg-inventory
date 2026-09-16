-- 依章程修正成員身分（2026-09-17）
alter table fund_members drop constraint if exists fund_members_role_check;
alter table fund_members add constraint fund_members_role_check check (role in ('巢穴人','巢穴眾','外家代表'));

update fund_members set role = '巢穴人' where nickname in ('陳臻','Steven','Ryan');
update fund_members set role = '外家代表' where nickname = '小八';

insert into fund_members (nickname, real_name, role, default_last5, active, sort_order) values
  ('周平',       null, '巢穴人',   null, true, 22),
  ('柏萊赫夫夫', null, '巢穴人',   null, true, 23),
  ('Colson&懸',  null, '外家代表', null, true, 24),
  ('阿祈',   '蕭靖祈', '外家代表', null, true, 25)
on conflict (nickname) do nothing;
