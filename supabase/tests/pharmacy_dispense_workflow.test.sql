begin;
select plan(54);

create temp table test_actor as
select id from public.profiles where email = 'admin@meenakshihospital.com' limit 1;
select ok(exists(select 1 from test_actor), 'configured pharmacy fixture actor exists');
select set_config('request.jwt.claim.sub', (select id::text from test_actor), true);
update public.profiles set role = 'pharmacy', doctor_id = null
where id = (select id from test_actor);

insert into public.departments(id, name)
values ('24000000-0000-0000-0000-000000000001', 'Dispense workflow test');
insert into public.doctors(
  id, display_name, department_id, registration_number,
  op_fee_paise, follow_up_fee_paise, ip_visit_fee_paise
) values (
  '24000000-0000-0000-0000-000000000002', 'Dr Dispense Test',
  '24000000-0000-0000-0000-000000000001', 'DISPENSE-TEST-20260824',
  0, 0, 0
);
insert into public.patients(id, phone_normalized, name, created_by)
values
  ('24000000-0000-0000-0000-000000000003', '9876500021', 'Full Supply Test', (select id from test_actor)),
  ('24000000-0000-0000-0000-000000000004', '9876500022', 'Partial Supply Test', (select id from test_actor)),
  ('24000000-0000-0000-0000-000000000005', '9876500023', 'Unavailable Supply Test', (select id from test_actor)),
  ('24000000-0000-0000-0000-000000000025', '9876500024', 'Trusted Fee Test', (select id from test_actor));
insert into public.visits(
  id, patient_id, doctor_id, department_id, visit_type, visit_date,
  token_number, fee_paise, status, idempotency_key, created_by
) values
  ('24000000-0000-0000-0000-000000000006', '24000000-0000-0000-0000-000000000003', '24000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', 'op', current_date, 24001, 0, 'completed', '24000000-0000-0000-0000-000000000016', (select id from test_actor)),
  ('24000000-0000-0000-0000-000000000007', '24000000-0000-0000-0000-000000000004', '24000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', 'op', current_date, 24002, 0, 'completed', '24000000-0000-0000-0000-000000000017', (select id from test_actor)),
  ('24000000-0000-0000-0000-000000000008', '24000000-0000-0000-0000-000000000005', '24000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', 'op', current_date, 24003, 0, 'completed', '24000000-0000-0000-0000-000000000018', (select id from test_actor)),
  ('24000000-0000-0000-0000-000000000026', '24000000-0000-0000-0000-000000000025', '24000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001', 'op', current_date, 24004, 50000, 'waiting', '24000000-0000-0000-0000-000000000027', (select id from test_actor));
insert into public.medicine_directory(
  id, brand_name, generic_name, strength, dosage_form, source
) values (
  '24000000-0000-0000-0000-000000000009', 'Dispense Test Tablet',
  'Test medicine', '10 mg', 'Tablet', 'automated-test'
);
insert into public.medicine_batches(
  id, medicine_id, batch_number, expiry_date, quantity,
  selling_price_paise, units_per_pack, low_stock_threshold
) values (
  '24000000-0000-0000-0000-000000000010',
  '24000000-0000-0000-0000-000000000009', 'TEST-BATCH-24',
  current_date + 365, 100, 3000, 10, 5
);
insert into public.prescriptions(id, visit_id, doctor_id, status)
values
  ('24000000-0000-0000-0000-000000000011', '24000000-0000-0000-0000-000000000006', '24000000-0000-0000-0000-000000000002', 'draft'),
  ('24000000-0000-0000-0000-000000000012', '24000000-0000-0000-0000-000000000007', '24000000-0000-0000-0000-000000000002', 'draft'),
  ('24000000-0000-0000-0000-000000000013', '24000000-0000-0000-0000-000000000008', '24000000-0000-0000-0000-000000000002', 'draft');
insert into public.prescription_items(
  id, prescription_id, medicine_id, medicine_name, requested_quantity
) values
  ('24000000-0000-0000-0000-000000000014', '24000000-0000-0000-0000-000000000011', '24000000-0000-0000-0000-000000000009', 'Dispense Test Tablet', 10),
  ('24000000-0000-0000-0000-000000000015', '24000000-0000-0000-0000-000000000012', '24000000-0000-0000-0000-000000000009', 'Dispense Test Tablet', 10),
  ('24000000-0000-0000-0000-000000000019', '24000000-0000-0000-0000-000000000013', '24000000-0000-0000-0000-000000000009', 'Dispense Test Tablet', 7);
update public.prescriptions set status = 'pending'
where id in (
  '24000000-0000-0000-0000-000000000011',
  '24000000-0000-0000-0000-000000000012',
  '24000000-0000-0000-0000-000000000013'
);

create temp table dispense_results(kind text primary key, sale_id uuid);
set local role authenticated;

select lives_ok($$
  insert into dispense_results values (
    'full', public.dispense_prescription(
      '24000000-0000-0000-0000-000000000011',
      '[{"prescription_item_id":"24000000-0000-0000-0000-000000000014","batch_id":"24000000-0000-0000-0000-000000000010","quantity":10}]'::jsonb,
      'cash', '24000000-0000-0000-0000-000000000020', 0
    )
  )
$$, 'full dispense succeeds');
select is((select status::text from public.prescriptions where id = '24000000-0000-0000-0000-000000000011'), 'dispensed', 'full dispense closes the prescription');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 90, 'full dispense decrements the exact batch quantity');
select is((select dispensed_quantity from public.prescription_items where id = '24000000-0000-0000-0000-000000000014'), 10, 'full dispense records exact supplied quantity');
select is((select total_paise from public.pharmacy_sales where id = (select sale_id from dispense_results where kind = 'full')), 3000::bigint, 'full sale total uses pack price arithmetic');
select is((select sm.quantity_delta from public.stock_movements sm join public.pharmacy_sale_items si on si.id = sm.idempotency_key where si.sale_id = (select sale_id from dispense_results where kind = 'full')), -10, 'full dispense writes an exact stock-out ledger row');

select lives_ok($$
  select public.dispense_prescription(
    '24000000-0000-0000-0000-000000000011',
    '[{"prescription_item_id":"24000000-0000-0000-0000-000000000014","batch_id":"24000000-0000-0000-0000-000000000010","quantity":10}]'::jsonb,
    'cash', '24000000-0000-0000-0000-000000000020', 0
  )
$$, 'full dispense retry is idempotent');
select is((select count(*) from public.pharmacy_sales where prescription_id = '24000000-0000-0000-0000-000000000011'), 1::bigint, 'retry creates no duplicate sale');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 90, 'retry does not decrement stock twice');
select is((select count(*) from public.stock_movements where reason = 'Prescription dispense'), 1::bigint, 'retry creates no duplicate stock movement');

select lives_ok($$
  insert into dispense_results values (
    'partial', public.dispense_prescription(
      '24000000-0000-0000-0000-000000000012',
      '[{"prescription_item_id":"24000000-0000-0000-0000-000000000015","batch_id":"24000000-0000-0000-0000-000000000010","quantity":4}]'::jsonb,
      'upi', '24000000-0000-0000-0000-000000000021', 0
    )
  )
$$, 'partial dispense succeeds');
select is((select status::text from public.prescriptions where id = '24000000-0000-0000-0000-000000000012'), 'partially_dispensed', 'partial dispense remains open');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 86, 'partial dispense decrements only supplied stock');
select is((select total_paise from public.pharmacy_sales where id = (select sale_id from dispense_results where kind = 'partial')), 1200::bigint, 'partial sale bills only supplied quantity');
select is((select sm.quantity_delta from public.stock_movements sm join public.pharmacy_sale_items si on si.id = sm.idempotency_key where si.sale_id = (select sale_id from dispense_results where kind = 'partial')), -4, 'partial dispense writes only supplied quantity to stock ledger');
select is((select requested_quantity from public.prescription_items where id = '24000000-0000-0000-0000-000000000015'), 10, 'consultant prescribed quantity remains unchanged');

select throws_ok($$
  select public.dispense_prescription(
    '24000000-0000-0000-0000-000000000012',
    '[{"prescription_item_id":"24000000-0000-0000-0000-000000000015","batch_id":"24000000-0000-0000-0000-000000000010","quantity":1,"new_requested_quantity":20}]'::jsonb,
    'cash', '24000000-0000-0000-0000-000000000022', 0
  )
$$, '23514', 'prescribed quantity cannot be changed at pharmacy', 'pharmacy cannot raise consultant quantity');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 86, 'rejected quantity change rolls back stock');

select lives_ok($$
  select public.mark_prescription_unavailable(
    '24000000-0000-0000-0000-000000000013',
    '24000000-0000-0000-0000-000000000023'
  )
$$, 'fully unavailable prescription can be finalized');
select is((select status::text from public.prescriptions where id = '24000000-0000-0000-0000-000000000013'), 'unavailable', 'fully unavailable prescription records explicit outcome');
select is((select count(*) from public.pharmacy_sales where prescription_id = '24000000-0000-0000-0000-000000000013'), 0::bigint, 'unavailable outcome creates no sale');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 86, 'unavailable outcome does not change stock');
select is((select count(*) from public.stock_movements where reason = 'Prescription dispense'), 2::bigint, 'unavailable outcome creates no stock movement');
select lives_ok($$
  select public.mark_prescription_unavailable(
    '24000000-0000-0000-0000-000000000013',
    '24000000-0000-0000-0000-000000000023'
  )
$$, 'unavailable retry is idempotent');
select is((select count(*) from public.audit_logs where action = 'PRESCRIPTION_UNAVAILABLE' and entity_id = '24000000-0000-0000-0000-000000000013'), 1::bigint, 'unavailable retry creates one outcome record');

select lives_ok($$
  select public.mark_prescription_unavailable(
    '24000000-0000-0000-0000-000000000012',
    '24000000-0000-0000-0000-000000000024'
  )
$$, 'remaining quantity after a partial dispense can be finalized unavailable');
select is((select status::text from public.prescriptions where id = '24000000-0000-0000-0000-000000000012'), 'unavailable', 'partial shortage receives final unavailable outcome');
select is((select count(*) from public.pharmacy_sales where prescription_id = '24000000-0000-0000-0000-000000000012'), 1::bigint, 'finalizing shortage creates no second sale');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 86, 'finalizing partial shortage does not change stock');

select lives_ok($$
  select public.save_visit_consultation(
    p_visit_id => '24000000-0000-0000-0000-000000000026',
    p_symptoms => 'Paper prescription', p_history => null,
    p_examination => null, p_assessment => 'Test assessment', p_advice => null,
    p_follow_up_type => 'none', p_follow_up_date => null, p_follow_up_days => null,
    p_medicines => '[{"medicine_id":"24000000-0000-0000-0000-000000000009","medicine_name":"Dispense Test Tablet","quantity":2}]'::jsonb,
    p_tests => '[]'::jsonb, p_complete => false, p_fee_paise => 20000,
    p_admission_recommended => false, p_admission_ward_type => null,
    p_admission_reason => null, p_diagnoses => '[]'::jsonb
  )
$$, 'pharmacy can save the authorized paper-consultation fee override');
select is(public.get_editable_consultation_fee('24000000-0000-0000-0000-000000000026'), 20000::bigint, 'saved fee override reloads exactly when the draft is reopened');
select lives_ok($$
  select public.save_visit_consultation(
    p_visit_id => '24000000-0000-0000-0000-000000000026',
    p_symptoms => 'Paper prescription', p_history => null,
    p_examination => null, p_assessment => 'Test assessment', p_advice => null,
    p_follow_up_type => 'none', p_follow_up_date => null, p_follow_up_days => null,
    p_medicines => '[{"medicine_id":"24000000-0000-0000-0000-000000000009","medicine_name":"Dispense Test Tablet","quantity":2}]'::jsonb,
    p_tests => '[]'::jsonb, p_complete => true, p_fee_paise => 20000,
    p_admission_recommended => false, p_admission_ward_type => null,
    p_admission_reason => null, p_diagnoses => '[]'::jsonb
  )
$$, 'paper consultation completes with its saved fee and prescription');

create temp table fee_rx as
select p.id prescription_id, i.id item_id
from public.prescriptions p
join public.prescription_items i on i.prescription_id = p.id
where p.visit_id = '24000000-0000-0000-0000-000000000026';

select throws_ok(format($sql$
  select public.dispense_prescription(
    %L, jsonb_build_array(jsonb_build_object(
      'prescription_item_id', %L, 'batch_id', %L, 'quantity', 2
    )), 'cash', %L, 10000
  )
$sql$,
  (select prescription_id from fee_rx), (select item_id from fee_rx),
  '24000000-0000-0000-0000-000000000010',
  '24000000-0000-0000-0000-000000000028'
), '23514', 'exact outstanding consultation fee required', 'dispense rejects an arbitrary partial consultation fee');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 86, 'rejected fee collection rolls back stock');
reset role;
select is((select count(*) from public.visit_payments where visit_id = '24000000-0000-0000-0000-000000000026'), 0::bigint, 'rejected fee collection writes no payment');
set local role authenticated;

select lives_ok(format($sql$
  insert into dispense_results values (
    'trusted-fee', public.dispense_prescription(
      %L, jsonb_build_array(jsonb_build_object(
        'prescription_item_id', %L, 'batch_id', %L, 'quantity', 2
      )), 'cash', %L, 20000
    )
  )
$sql$,
  (select prescription_id from fee_rx), (select item_id from fee_rx),
  '24000000-0000-0000-0000-000000000010',
  '24000000-0000-0000-0000-000000000029'
), 'exact trusted consultation fee and medicine dispense succeed atomically');
reset role;
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 84, 'trusted-fee dispense decrements exact medicine stock');
select is((select total_paise from public.pharmacy_sales where id = (select sale_id from dispense_results where kind = 'trusted-fee')), 600::bigint, 'trusted-fee sale contains medicine value only');
select is((select amount_paise from public.visit_payments where visit_id = '24000000-0000-0000-0000-000000000026'), 20000::bigint, 'trusted outstanding consultation fee is collected exactly');
select is((select status::text from public.prescriptions where id = (select prescription_id from fee_rx)), 'dispensed', 'trusted-fee prescription is fully dispensed');
select is((select sm.quantity_delta from public.stock_movements sm join public.pharmacy_sale_items si on si.id = sm.idempotency_key where si.sale_id = (select sale_id from dispense_results where kind = 'trusted-fee')), -2, 'trusted-fee dispense records exact stock-out movement');
set local role authenticated;
select lives_ok(format($sql$
  select public.dispense_prescription(
    %L, jsonb_build_array(jsonb_build_object(
      'prescription_item_id', %L, 'batch_id', %L, 'quantity', 2
    )), 'cash', %L, 20000
  )
$sql$,
  (select prescription_id from fee_rx), (select item_id from fee_rx),
  '24000000-0000-0000-0000-000000000010',
  '24000000-0000-0000-0000-000000000029'
), 'trusted-fee dispense retry is idempotent');
reset role;
select is((select count(*) from public.visit_payments where visit_id = '24000000-0000-0000-0000-000000000026'), 1::bigint, 'trusted-fee retry creates no duplicate payment');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 84, 'trusted-fee retry does not decrement stock twice');

-- The counter may hand over more than was prescribed when the batch has the
-- stock for it; the prescribed quantity on record then follows what was
-- actually supplied, and the raise is auditable.
insert into public.patients(id, phone_normalized, name, created_by)
values ('24000000-0000-0000-0000-000000000031', '9876500025', 'Excess Supply Test', (select id from test_actor));
insert into public.visits(
  id, patient_id, doctor_id, department_id, visit_type, visit_date,
  token_number, fee_paise, status, idempotency_key, created_by
) values (
  '24000000-0000-0000-0000-000000000032', '24000000-0000-0000-0000-000000000031',
  '24000000-0000-0000-0000-000000000002', '24000000-0000-0000-0000-000000000001',
  'op', current_date, 24005, 0, 'completed',
  '24000000-0000-0000-0000-000000000033', (select id from test_actor)
);
insert into public.prescriptions(id, visit_id, doctor_id, status)
values ('24000000-0000-0000-0000-000000000034', '24000000-0000-0000-0000-000000000032', '24000000-0000-0000-0000-000000000002', 'draft');
insert into public.prescription_items(
  id, prescription_id, medicine_id, medicine_name, requested_quantity
) values (
  '24000000-0000-0000-0000-000000000035', '24000000-0000-0000-0000-000000000034',
  '24000000-0000-0000-0000-000000000009', 'Dispense Test Tablet', 6
);
update public.prescriptions set status = 'pending'
where id = '24000000-0000-0000-0000-000000000034';

set local role authenticated;
select lives_ok($$
  insert into dispense_results values (
    'excess', public.dispense_prescription(
      '24000000-0000-0000-0000-000000000034',
      '[{"prescription_item_id":"24000000-0000-0000-0000-000000000035","batch_id":"24000000-0000-0000-0000-000000000010","quantity":20}]'::jsonb,
      'cash', '24000000-0000-0000-0000-000000000036', 0
    )
  )
$$, 'counter may supply more than prescribed when the batch has the stock');
select is((select quantity from public.medicine_batches where id = '24000000-0000-0000-0000-000000000010'), 64, 'excess dispense decrements the full supplied quantity');
select is((select dispensed_quantity from public.prescription_items where id = '24000000-0000-0000-0000-000000000035'), 20, 'excess dispense records what was actually handed over');
select is((select requested_quantity from public.prescription_items where id = '24000000-0000-0000-0000-000000000035'), 20, 'prescribed quantity rises to match the supplied quantity');
select is((select status::text from public.prescriptions where id = '24000000-0000-0000-0000-000000000034'), 'dispensed', 'excess dispense closes the prescription');
select is((select total_paise from public.pharmacy_sales where id = (select sale_id from dispense_results where kind = 'excess')), 6000::bigint, 'excess sale bills every supplied piece');
select is((select sm.quantity_delta from public.stock_movements sm join public.pharmacy_sale_items si on si.id = sm.idempotency_key where si.sale_id = (select sale_id from dispense_results where kind = 'excess')), -20, 'excess dispense writes the full supplied quantity to the stock ledger');
reset role;
select is((select count(*) from public.audit_logs where action = 'PRESCRIPTION_QUANTITY_RAISED' and entity_id = '24000000-0000-0000-0000-000000000035' and (metadata ->> 'excess_quantity')::integer = 14), 1::bigint, 'raising the prescribed quantity is written to the audit trail');

update public.profiles set role = 'doctor'
where id = (select id from test_actor);
set local role authenticated;
select throws_ok($$
  select public.mark_prescription_unavailable(
    '24000000-0000-0000-0000-000000000013',
    '24000000-0000-0000-0000-000000000030'
  )
$$, '42501', 'forbidden', 'doctor cannot close a prescription as unavailable');
reset role;

select * from finish();
rollback;
