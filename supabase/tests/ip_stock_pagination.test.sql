-- Run only against the local/staging test database; all fixtures roll back.
begin;
select plan(7);

select set_config('request.jwt.claim.sub', (
  select id::text from public.profiles where role = 'admin' and status = 'active' limit 1
), true);

insert into public.inventory_items(id, name, unit, quantity, selling_price_paise, active)
select md5('pagination-fixture-' || n)::uuid, 'PaginationFixtureSameName ' || lpad(n::text, 4, '0'), 'piece', 10, 200, true
from generate_series(1, 530) n;

select is((select count(*)::integer from public.search_ip_stock_catalog_page('PaginationFixtureSameName', 25, 0)), 25, 'first page is bounded');
select is((select count(*)::integer from public.search_ip_stock_catalog_page('PaginationFixtureSameName', 25, 500)), 25, 'items beyond the old 500-row cap are reachable');
select is((select count(*)::integer from public.search_ip_stock_catalog_page('PaginationFixtureSameName', 25, 525)), 5, 'last page contains remaining items');
select is((select count(*)::integer from public.search_ip_stock_catalog_page('PaginationFixtureSameName', 25, 550)), 0, 'past the last page is empty');
select is((select count(*)::integer from (
  select stock_id from public.search_ip_stock_catalog_page('PaginationFixtureSameName', 25, 0)
  intersect
  select stock_id from public.search_ip_stock_catalog_page('PaginationFixtureSameName', 25, 25)
) overlap), 0, 'matching items do not repeat across pages');
select is((select sum(quantity)::bigint from public.inventory_items where name like 'PaginationFixtureSameName %'), 5300::bigint, 'browsing never changes stock');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select * from public.search_ip_stock_catalog_page('',25,0)$$, '42501', 'forbidden', 'anonymous callers cannot read stock prices');

select * from finish();
rollback;
