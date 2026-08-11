begin;
select plan(12);
create temp table test_actor as select id from public.profiles where email='admin@meenakshihospital.com' limit 1;
select ok(exists(select 1 from test_actor),'configured admin fixture exists');
select set_config('request.jwt.claim.sub',(select id::text from test_actor),true);

set local role authenticated;
select lives_ok($$select public.report_admin_overview(current_date,current_date)$$,'admin can use financial analytics');
reset role;

update public.profiles set role='doctor',doctor_id=null where id=(select id from test_actor);
set local role authenticated;
select throws_ok($$select public.report_admin_overview(current_date,current_date)$$,'42501','forbidden','doctor cannot use admin analytics');
select is((public.dashboard_summary() ? 'collected_today_paise'),false,'doctor dashboard payload contains no hospital collection key');
select throws_ok($$select purchase_price_paise from public.medicine_batches limit 1$$,'42501',null,'doctor cannot query pharmacy cost columns');
select lives_ok($$select * from public.search_medicine_availability('par',20)$$,'doctor can query safe medicine availability');
select throws_ok($$select public.dispense_prescription('00000000-0000-0000-0000-000000000001','[]'::jsonb,'cash','00000000-0000-0000-0000-000000000002')$$,'42501','forbidden','doctor cannot dispense prescriptions');
select is((select count(*) from public.visit_payments),0::bigint,'doctor cannot read financial payment rows');
select throws_ok($$select fee_paise from public.visits limit 1$$,'42501',null,'doctor cannot query visit fee columns');
select throws_ok($$select * from public.get_visit_financial_summaries(array[]::uuid[])$$,'42501','forbidden','doctor cannot call guarded visit finance RPC');
reset role;

update public.profiles set role='pharmacy' where id=(select id from test_actor);
set local role authenticated;
select is((select count(*) from public.patients),0::bigint,'pharmacy cannot read patient directory rows');
select throws_ok($$insert into public.departments(name) values('Unauthorized')$$,'42501',null,'pharmacy cannot manage departments');
reset role;

select * from finish();
rollback;
