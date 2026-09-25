-- Discount ledger: limits, retries, balances, voids, counter bills, RLS and
-- the reports that read it. One DO block so each step can use the rows the
-- previous one created; any failed ASSERT fails the plan.
begin;
select plan(1);

do $$
declare
  v_admin uuid := '25000000-0000-0000-0000-000000000001';
  v_reception uuid := '25000000-0000-0000-0000-000000000002';
  v_pharmacy uuid := '25000000-0000-0000-0000-000000000003';
  v_ip uuid := '25000000-0000-0000-0000-000000000004';
  v_doctor_profile uuid := '25000000-0000-0000-0000-000000000005';
  v_doctor uuid := '25000000-0000-0000-0000-000000000011';
  v_patient uuid;
  v_patient2 uuid;
  v_visit uuid;
  v_visit2 uuid;
  v_rx uuid;
  v_item uuid;
  v_batch public.medicine_batches%rowtype;
  v_sale uuid;
  v_key uuid;
  v_ticket uuid;
  v_request uuid;
  v_request_item uuid;
  v_proc uuid;
  v_discount uuid;
  v_n bigint;
  v_m bigint;
  v_json jsonb;
  v_failed boolean;
  v_msg text;
  v_receipt record;
begin
  -- Self-contained fixtures: one account per desk (the auth trigger creates
  -- each profile with the role in its metadata), a doctor and a stocked batch.
  insert into auth.users(id, email, raw_user_meta_data, aud, role)
  select id, email, jsonb_build_object('full_name', name, 'role', role), 'authenticated', 'authenticated'
  from (values
    (v_admin, 'discount-admin@test.invalid', 'Discount Admin', 'admin'),
    (v_reception, 'discount-reception@test.invalid', 'Discount Reception', 'reception'),
    (v_pharmacy, 'discount-pharmacy@test.invalid', 'Discount Pharmacy', 'pharmacy'),
    (v_ip, 'discount-ip@test.invalid', 'Discount IP', 'ip'),
    (v_doctor_profile, 'discount-doctor@test.invalid', 'Discount Doctor', 'doctor')
  ) as fixture(id, email, name, role);
  insert into public.departments(id, name)
  values ('25000000-0000-0000-0000-000000000010', 'Discount test department');
  insert into public.doctors(id, display_name, department_id, registration_number,
    op_fee_paise, follow_up_fee_paise, ip_visit_fee_paise)
  values (v_doctor, 'Dr Discount Test', '25000000-0000-0000-0000-000000000010',
    'DISCOUNT-TEST-20260925', 50000, 30000, 50000);
  update public.profiles set doctor_id = v_doctor where id = v_doctor_profile;
  insert into public.medicine_directory(id, brand_name, generic_name, strength, dosage_form, source)
  values ('25000000-0000-0000-0000-000000000012', 'ZZ E2E Discount Tablet', 'Test medicine', '10 mg', 'Tablet', 'automated-test');
  insert into public.medicine_batches(id, medicine_id, batch_number, expiry_date, quantity,
    selling_price_paise, units_per_pack, low_stock_threshold)
  values ('25000000-0000-0000-0000-000000000013', '25000000-0000-0000-0000-000000000012',
    'DISCOUNT-TEST', current_date + 365, 100, 3000, 10, 5);
  insert into public.hospital_settings(id) values (true) on conflict (id) do nothing;
  update public.hospital_settings set max_discount_percent = 10 where id;

  -- Acting identity helper: set_config of the JWT claims auth.uid() reads.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  assert public.discount_limit_percent() = 10, 'default limit';

  insert into public.patients(name, phone_normalized) values ('ZZ E2E Discount One', '6999900001') returning id into v_patient;
  insert into public.patients(name, phone_normalized) values ('ZZ E2E Discount Two', '6999900002') returning id into v_patient2;

  ---------------------------------------------------------------- visit payment
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select visit_id into v_visit from public.create_visit_with_token(v_patient, v_doctor, 'op', 50000, 0, 'cash', null, null, gen_random_uuid());

  -- over the 10% limit (12%)
  begin
    perform public.collect_visit_payment(v_visit, 44000, 'cash', null, gen_random_uuid(), 6000, 'senior_citizen', null);
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'discount exceeds limit of 10 percent%', 'reception over limit: ' || coalesce(v_msg, 'no error');

  -- "other" without note
  begin
    perform public.collect_visit_payment(v_visit, 45000, 'cash', null, gen_random_uuid(), 5000, 'other', '  ');
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg = 'discount note required', 'other needs note: ' || coalesce(v_msg, 'no error');

  -- more than owed
  begin
    perform public.collect_visit_payment(v_visit, 46000, 'cash', null, gen_random_uuid(), 5000, 'staff', null);
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'payment exceeds outstanding%', 'overpay blocked: ' || coalesce(v_msg, 'no error');

  -- invalid reason
  begin
    perform public.collect_visit_payment(v_visit, 45000, 'cash', null, gen_random_uuid(), 5000, 'friend', null);
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg = 'discount reason required', 'bad reason: ' || coalesce(v_msg, 'no error');

  -- exactly 10% is allowed; retry with the same key records nothing more
  v_key := gen_random_uuid();
  perform public.collect_visit_payment(v_visit, 45000, 'upi', 'ref1', v_key, 5000, 'senior_citizen', null);
  perform public.collect_visit_payment(v_visit, 45000, 'upi', 'ref1', v_key, 5000, 'senior_citizen', null);
  select discount_paise into v_n from public.visits where id = v_visit;
  assert v_n = 5000, 'visit discount total ' || v_n;
  select sum(amount_paise) into v_n from public.visit_payments where visit_id = v_visit;
  assert v_n = 45000, 'visit paid ' || v_n;
  select count(*) into v_n from public.discounts where visit_id = v_visit;
  assert v_n = 1, 'one discount row after retry';
  select balance_paise into v_n from public.visit_consultation_balance(
    (select id from public.prescriptions where visit_id = v_visit limit 1));
  -- no prescription yet; check through the summaries RPC instead
  select fee_paise - collected_paise - discount_paise into v_n
  from public.get_visit_financial_summaries(array[v_visit]);
  assert v_n = 0, 'visit balance after discount ' || v_n;

  -- a direct payment can no longer overpay because the trigger counts discounts
  begin
    insert into public.visit_payments(visit_id, amount_paise, mode, idempotency_key)
    values (v_visit, 100, 'cash', gen_random_uuid());
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'payment exceeds outstanding visit balance%', 'trigger counts discount';

  -- nobody but the ledger may change the total
  begin
    update public.visits set discount_paise = 0 where id = v_visit;
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'discounts are recorded through the discount ledger%', 'total protected';

  -- void: reception may not, admin may, balance reopens, second void is a no-op
  select id into v_discount from public.discounts where visit_id = v_visit;
  begin
    perform public.void_discount(v_discount, 'wrong patient');
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg = 'forbidden', 'reception cannot void';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.void_discount(v_discount, 'Entered on wrong visit');
  perform public.void_discount(v_discount, 'Entered on wrong visit');
  select discount_paise into v_n from public.visits where id = v_visit;
  assert v_n = 0, 'void reopens balance';
  select count(*) into v_n from public.list_pending_consultation_fees(null, 7, 200) where visit_id = v_visit;
  -- (listed only once the visit is completed; it is still waiting here)
  begin
    update public.discounts set amount_paise = 1 where id = v_discount;
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed, 'voided row immutable';

  ------------------------------------------------------------- pharmacy dispense
  select * into v_batch from public.medicine_batches
  where id = '25000000-0000-0000-0000-000000000013';

  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  select visit_id into v_visit2 from public.create_visit_with_token(v_patient2, v_doctor, 'op', 30000, 0, 'cash', null, null, gen_random_uuid());
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_rx := public.create_manual_prescription(v_visit2, null, null, 30000,
    jsonb_build_array(jsonb_build_object('medicine_id', v_batch.medicine_id, 'medicine_name', 'ZZ E2E test med', 'quantity', 4)),
    gen_random_uuid());
  select id into v_item from public.prescription_items where prescription_id = v_rx;

  -- medicines = 4 pieces; gross = medicines + 30000 fee
  v_m := round(4::numeric * v_batch.selling_price_paise / greatest(v_batch.units_per_pack, 1));

  perform set_config('request.jwt.claims', json_build_object('sub', v_pharmacy, 'role', 'authenticated')::text, true);
  -- pharmacy over the limit: nothing dispensed, stock untouched
  begin
    perform public.dispense_prescription(v_rx,
      jsonb_build_array(jsonb_build_object('prescription_item_id', v_item, 'batch_id', v_batch.id, 'quantity', 4)),
      'cash', gen_random_uuid(), 30000, (v_m + 30000) / 10 + 1, 'staff', null);
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'discount exceeds limit%', 'pharmacy over limit: ' || coalesce(v_msg, 'no error');
  select quantity into v_n from public.medicine_batches where id = v_batch.id;
  assert v_n = v_batch.quantity, 'stock untouched on rejected dispense';

  -- admin (no limit): discount = all medicines + 1000 of the doctor fee
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_key := gen_random_uuid();
  v_sale := public.dispense_prescription(v_rx,
    jsonb_build_array(jsonb_build_object('prescription_item_id', v_item, 'batch_id', v_batch.id, 'quantity', 4)),
    'cash', v_key, 30000, v_m + 1000, 'doctor_advised', null);
  select quantity into v_n from public.medicine_batches where id = v_batch.id;
  assert v_n = v_batch.quantity - 4, 'stock reduces by full quantity despite discount';
  select total_paise, discount_paise into v_n, v_m from public.pharmacy_sales where id = v_sale;
  assert v_m = v_n, 'sale discount covers medicines';
  select discount_paise into v_n from public.visits where id = v_visit2;
  assert v_n = 1000, 'fee share recorded on visit ' || v_n;
  select coalesce(sum(amount_paise), 0) into v_n from public.visit_payments where visit_id = v_visit2;
  assert v_n = 29000, 'fee collected net ' || v_n;
  select * into v_receipt from public.get_sale_receipt(v_sale);
  assert v_receipt.medicines_discount_paise = v_receipt.medicines_paise
    and v_receipt.consultation_discount_paise = 1000
    and v_receipt.consultation_paise = 29000
    and v_receipt.discount_reason = 'doctor_advised', 'receipt breakdown';
  select balance_paise into v_n from public.visit_consultation_balance(v_rx);
  assert v_n = 0, 'no balance after discounted dispense';
  -- counter discounts are final
  select id into v_discount from public.discounts where pharmacy_sale_id = v_sale;
  begin
    perform public.void_discount(v_discount, 'try');
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg = 'counter discount is final', 'sale discount not voidable';

  ------------------------------------------------------------------- procedure
  perform set_config('request.jwt.claims', json_build_object('sub', v_pharmacy, 'role', 'authenticated')::text, true);
  v_proc := public.create_procedure_sale(v_patient, null, v_doctor, 'ZZ E2E Dressing', 20000, '[]'::jsonb, 'cash', null, gen_random_uuid(), 2000, 'charity', null);
  select discount_paise into v_n from public.procedure_sales where id = v_proc;
  assert v_n = 2000, 'procedure discount';

  --------------------------------------------------------------------------- IP
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select ticket_id into v_ticket from public.create_ip_ticket(v_patient, v_doctor, null, 'ZZ', 'ZZ', 'Discount test', 0, 'cash', false, gen_random_uuid());
  perform public.add_custom_ip_charge(v_ticket, 'ZZ E2E care', 1, 100000, gen_random_uuid());

  perform set_config('request.jwt.claims', json_build_object('sub', v_ip, 'role', 'authenticated')::text, true);
  begin
    perform public.add_ip_payment(v_ticket, 80000, 'cash', null, gen_random_uuid(), 11000, 'staff', null);
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'discount exceeds limit%', 'ip over limit';
  perform public.add_ip_payment(v_ticket, 80000, 'cash', null, gen_random_uuid(), 10000, 'staff', null);
  select balance_paise, discount_paise into v_n, v_m from public.get_ip_financial_summaries(array[v_ticket]);
  assert v_n = 10000 and v_m = 10000, 'ip balance ' || v_n || ' discount ' || v_m;
  begin
    perform public.add_ip_payment(v_ticket, 20000, 'cash', null, gen_random_uuid(), 0, null, null);
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'payment exceeds outstanding%', 'ip overpay';
  -- cumulative limit: the 10% is used up, a further 1 rupee is refused
  begin
    perform public.add_ip_payment(v_ticket, 0, null, null, gen_random_uuid(), 100, 'staff', null);
    v_failed := false;
  exception when others then v_failed := true; v_msg := sqlerrm; end;
  assert v_failed and v_msg like 'discount exceeds limit%', 'ip cumulative limit';
  perform public.add_ip_payment(v_ticket, 10000, 'upi', null, gen_random_uuid(), 0, null, null);
  select balance_paise into v_n from public.get_ip_financial_summaries(array[v_ticket]);
  assert v_n = 0, 'ip settled';

  -- IP items collected at the pharmacy counter, discounted
  v_request := public.create_ip_inventory_request(v_ticket, jsonb_build_array(jsonb_build_object('name', 'ZZ E2E gauze', 'quantity', 2)), null, gen_random_uuid());
  select id into v_request_item from public.ip_inventory_request_items where request_id = v_request;
  perform set_config('request.jwt.claims', json_build_object('sub', v_pharmacy, 'role', 'authenticated')::text, true);
  v_key := gen_random_uuid();
  perform public.fulfill_ip_inventory_request(v_request,
    jsonb_build_array(jsonb_build_object('request_item_id', v_request_item, 'fulfilled_quantity', 2, 'unit_price_paise', 5000)),
    v_key, 10000, 'cash', null, 'pharmacy_counter', 1000, 'round_off', null);
  -- replay with the same key is accepted and adds nothing
  perform public.fulfill_ip_inventory_request(v_request,
    jsonb_build_array(jsonb_build_object('request_item_id', v_request_item, 'fulfilled_quantity', 2, 'unit_price_paise', 5000)),
    v_key, 10000, 'cash', null, 'pharmacy_counter', 1000, 'round_off', null);
  select counter_collected_paise, counter_discount_paise into v_n, v_m from public.ip_inventory_requests where id = v_request;
  assert v_n = 10000 and v_m = 1000, 'counter gross/discount';
  select collected_paise into v_n from public.list_ip_inventory_requests('all', null, 200, 0) where request_id = v_request;
  assert v_n is null or v_n = 9000, 'counter list net ' || coalesce(v_n::text, 'null');
  select collected_paise, discount_paise into v_n, v_m from public.get_ip_inventory_request_receipt(v_request);
  assert v_n = 9000 and v_m = 1000, 'counter receipt';

  ------------------------------------------------------------------------- RLS
  perform set_config('request.jwt.claims', json_build_object('sub', v_doctor_profile, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.discounts;
  assert v_n = 0, 'doctor sees no discounts';
  begin
    perform public.discount_limit_percent();
    v_failed := false;
  exception when others then v_failed := true; end;
  assert v_failed, 'helpers not executable by staff';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.discounts where source <> 'op_fee';
  assert v_n = 0, 'reception sees only visit discounts';
  select max_discount_percent into v_n from public.hospital_settings where id;
  assert v_n = 10, 'staff can read the limit';
  begin
    insert into public.discounts(visit_id, gross_paise, amount_paise, reason, idempotency_key)
    values (v_visit, 50000, 100, 'staff', gen_random_uuid());
    v_failed := false;
  exception when others then v_failed := true; end;
  assert v_failed, 'no direct inserts';
  begin
    update public.hospital_settings set max_discount_percent = 100 where id;
    get diagnostics v_n = row_count;
    v_failed := v_n = 0;
  exception when others then v_failed := true; end;
  assert v_failed, 'reception cannot change the limit';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ip, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.discounts where source <> 'ip_ticket';
  assert v_n = 0, 'ip sees only ticket discounts';
  reset role;

  --------------------------------------------------------------- limit setting
  begin
    update public.hospital_settings set max_discount_percent = 0 where id;
    v_failed := false;
  exception when others then v_failed := true; end;
  assert v_failed, 'limit 0 rejected';
  begin
    update public.hospital_settings set max_discount_percent = 101 where id;
    v_failed := false;
  exception when others then v_failed := true; end;
  assert v_failed, 'limit 101 rejected';
  update public.hospital_settings set max_discount_percent = 100 where id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_reception, 'role', 'authenticated')::text, true);
  -- visit 1 balance reopened to 5000 after the void; 100% now allowed
  perform public.collect_visit_payment(v_visit, 0, null, null, gen_random_uuid(), 5000, 'charity', null);
  select discount_paise into v_n from public.visits where id = v_visit;
  assert v_n = 5000, 'full discount at 100% limit';

  ---------------------------------------------------------- reports still run
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_json := public.report_admin_overview(current_date - 1, current_date);
  assert (v_json ->> 'discount_total_paise')::bigint >= 5000 + 1000 + 2000 + 10000 + 1000, 'report discount total ' || (v_json ->> 'discount_total_paise');
  assert jsonb_array_length(v_json -> 'discounts_by_reason') >= 4, 'by reason';
  assert (v_json ->> 'pharmacy_collected_paise') is not null, 'pharmacy collected';
  select count(*) into v_n from public.report_staff_activity(current_date, current_date) where discounts_count > 0;
  assert v_n >= 3, 'staff discounts ' || v_n;
  select count(*), max(total_amount_paise) into v_n, v_m from public.list_discounts(current_date, current_date);
  assert v_n >= 6, 'register rows ' || v_n;
  perform * from public.list_discounts(current_date, current_date, 'pharmacy', 'charity', 'ZZ E2E');
  v_json := public.dashboard_summary();
  assert (v_json ->> 'discount_today_paise')::bigint >= 19000, 'dashboard discount';
  perform * from public.dashboard_metric_detail_for_role('collected_today_paise', 100);
  select count(*) into v_n from public.dashboard_metric_detail_for_role('discount_today_paise', 100);
  assert v_n >= 5, 'discount detail rows ' || v_n;
  perform * from public.list_pharmacy_sales(null, 50, 0);
  perform * from public.list_procedure_sales(null, 50, 0);
  perform * from public.get_procedure_bill_receipt(v_proc);
  perform * from public.list_pending_prescriptions(null, 50, 'pending', 0);
  perform * from public.list_pending_consultation_fees(null, 7, 100);
  foreach v_discount in array array[v_reception, v_pharmacy, v_ip, v_doctor_profile] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_discount, 'role', 'authenticated')::text, true);
    v_json := public.dashboard_summary();
    assert not (v_json ? 'discount_today_paise'), 'discount KPI admin-only';
    begin
      perform * from public.dashboard_metric_detail_for_role('discount_today_paise', 10);
      v_failed := false;
    exception when others then v_failed := true; end;
    assert v_failed, 'discount detail admin-only';
  end loop;

  raise notice 'ALL DISCOUNT CHECKS PASSED';
end
$$;

select pass('discount ledger workflow');
select * from finish();
rollback;
