begin;
select plan(30);
create temp table test_actor as select id from public.profiles where email='admin@meenakshihospital.com' limit 1;
select ok(exists(select 1 from test_actor),'configured admin fixture exists');
select set_config('request.jwt.claim.sub',(select id::text from test_actor),true);

set local role authenticated;
select lives_ok($$select public.report_admin_overview(current_date,current_date)$$,'admin can use financial analytics');
reset role;

update public.profiles set role='reception',doctor_id=null where id=(select id from test_actor);
set local role authenticated;
select lives_ok($$select public.dashboard_summary()$$,'reception can load its combined dashboard');
select is((public.dashboard_summary() ? 'vitals_pending'),true,'reception dashboard includes the former OP vitals metric');
select lives_ok($$select * from public.list_medicine_directory(null,20,0)$$,'reception can list safe medicine availability');
select lives_ok($$select * from public.search_medicine_availability('par',20)$$,'reception can search safe medicine availability');
select lives_ok($$select count(*) from public.patient_reports$$,'reception can read the reports workspace');
select throws_ok(
  $$select public.record_visit_vitals('00000000-0000-0000-0000-000000000001',null,null,null,null,null,null,null,null,null)$$,
  '42501','visit unavailable','reception reaches the vitals workflow guard rather than a role denial'
);
select throws_ok($$select public.report_admin_overview(current_date,current_date)$$,'42501','forbidden','reception cannot use admin financial analytics');
select throws_ok($$select public.dispense_prescription('00000000-0000-0000-0000-000000000001','[]'::jsonb,'cash','00000000-0000-0000-0000-000000000002')$$,'42501','forbidden','reception cannot dispense prescriptions');
select is((select count(*) from public.profiles where role='op'),0::bigint,'separate OP profiles were migrated to reception');
reset role;

update public.profiles set role='doctor',doctor_id=null where id=(select id from test_actor);
set local role authenticated;
select throws_ok($$select public.report_admin_overview(current_date,current_date)$$,'42501','forbidden','doctor cannot use admin analytics');
select is((public.dashboard_summary() ? 'collected_today_paise'),false,'doctor dashboard payload contains no hospital collection key');
select throws_ok($$select purchase_price_paise from public.medicine_batches limit 1$$,'42501',null,'doctor cannot query pharmacy cost columns');
select lives_ok($$select * from public.search_medicine_availability('par',20)$$,'doctor can query safe medicine availability');
select lives_ok($$select * from public.search_diagnosis_terms('fever','SNOMED-CT',20)$$,'doctor can search the local SNOMED-ready directory');
select throws_ok($$select public.dispense_prescription('00000000-0000-0000-0000-000000000001','[]'::jsonb,'cash','00000000-0000-0000-0000-000000000002')$$,'42501','forbidden','doctor cannot dispense prescriptions');
select throws_ok($$select public.expire_stale_prescriptions()$$,'42501','forbidden','doctor cannot run pharmacy expiry maintenance');
select lives_ok($$insert into public.notification_reads(user_id,notification_key) values(auth.uid(),'security-own-notification')$$,'users can persist their own notification read state');
select throws_ok($$insert into public.notification_reads(user_id,notification_key) values(gen_random_uuid(),'security-other-notification')$$,'42501',null,'users cannot write another notification read state');
select is((select count(*) from public.visit_payments),0::bigint,'doctor cannot read financial payment rows');
select throws_ok($$select fee_paise from public.visits limit 1$$,'42501',null,'doctor cannot query visit fee columns');
select throws_ok($$select * from public.get_visit_financial_summaries(array[]::uuid[])$$,'42501','forbidden','doctor cannot call guarded visit finance RPC');
select throws_ok($$select counter_collected_paise from public.ip_inventory_requests limit 1$$,'42501',null,'doctor cannot query IP pharmacy counter collection amounts');
select throws_ok($$select unit_price_paise from public.ip_inventory_request_items limit 1$$,'42501',null,'doctor cannot query IP item prices');
select throws_ok($$select * from public.get_ip_inventory_request_receipt('00000000-0000-0000-0000-000000000001')$$,'42501','forbidden','doctor cannot open an IP item financial receipt');
reset role;

update public.profiles set role='pharmacy' where id=(select id from test_actor);
set local role authenticated;
select is((select count(*) from public.patients),0::bigint,'pharmacy cannot read patient directory rows');
select throws_ok($$insert into public.departments(name) values('Unauthorized')$$,'42501',null,'pharmacy cannot manage departments');
select lives_ok($$select * from public.search_diagnosis_terms('fever','SNOMED-CT',20)$$,'pharmacy can search diagnoses while transcribing a consultation');
select lives_ok($$select public.add_clinical_term('diagnosis','Locally entered test diagnosis')$$,'pharmacy transcription can remember a typed local diagnosis');
reset role;

select * from finish();
rollback;
