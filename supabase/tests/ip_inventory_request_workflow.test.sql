begin;

select plan(47);

create temp table test_actor as
select id from public.profiles
where email = 'admin@meenakshihospital.com'
limit 1;

create temp table flow_ids as
select
  md5('ip-request-flow-patient')::uuid as patient_id,
  md5('ip-request-flow-ticket')::uuid as ticket_id,
  md5('ip-request-flow-medicine')::uuid as medicine_id,
  md5('ip-request-flow-batch-one')::uuid as batch_one_id,
  md5('ip-request-flow-batch-two')::uuid as batch_two_id,
  md5('ip-request-flow-inventory')::uuid as inventory_id,
  md5('ip-request-flow-request-paid')::uuid as paid_request_id,
  md5('ip-request-flow-request-ticket')::uuid as ticket_request_id,
  md5('ip-request-flow-item-medicine')::uuid as medicine_item_id,
  md5('ip-request-flow-item-inventory')::uuid as inventory_item_id,
  md5('ip-request-flow-item-manual')::uuid as manual_item_id,
  md5('ip-request-flow-item-unavailable')::uuid as unavailable_item_id,
  md5('ip-request-flow-item-ticket')::uuid as ticket_item_id,
  md5('ip-request-flow-fulfill-paid')::uuid as paid_key,
  md5('ip-request-flow-fulfill-ticket')::uuid as ticket_key,
  (select id from public.doctors order by created_at limit 1) as doctor_id;

grant select on test_actor, flow_ids to authenticated;

select ok(exists(select 1 from test_actor), 'configured actor exists');
select ok(
  (select doctor_id is not null from flow_ids),
  'configured doctor fixture exists'
);

select set_config(
  'request.jwt.claim.sub',
  (select id::text from test_actor),
  true
);

insert into public.patients(id, phone_normalized, name, gender, created_by)
select patient_id, '6999999997', 'IP Stock Flow Patient', 'other',
  (select id from test_actor)
from flow_ids;

insert into public.ip_tickets(
  id, ticket_number, patient_id, doctor_id, status, created_by,
  idempotency_key
)
select ticket_id, 'IP-TEST-STOCK-FLOW', patient_id, doctor_id, 'admitted',
  (select id from test_actor), md5('ip-request-flow-ticket-key')::uuid
from flow_ids;

insert into public.medicine_directory(
  id, brand_name, generic_name, strength, dosage_form, source
)
select medicine_id, 'Workflow Med', 'Workflow Generic', '10 mg', 'Tablet',
  'pgTAP fixture'
from flow_ids;

insert into public.medicine_batches(
  id, medicine_id, batch_number, expiry_date, quantity,
  purchase_price_paise, selling_price_paise, low_stock_threshold,
  active, units_per_pack
)
select batch_one_id, medicine_id, 'FLOW-A', current_date + 30, 2,
  500, 1000, 0, true, 10
from flow_ids
union all
select batch_two_id, medicine_id, 'FLOW-B', current_date + 60, 10,
  1000, 2000, 0, true, 10
from flow_ids;

insert into public.inventory_items(
  id, name, unit, selling_price_paise, quantity,
  low_stock_threshold, active
)
select inventory_id, 'Workflow Gauze', 'piece', 500, 10, 0, true
from flow_ids;

set local role authenticated;
select lives_ok(
  $request$
  select public.create_ip_inventory_request(
    (select ticket_id from flow_ids),
    jsonb_build_array(jsonb_build_object(
      'name', 'Workflow Gauze',
      'quantity', 4
    )),
    'No stock reservation check',
    md5('ip-request-flow-no-reservation')::uuid
  )
  $request$,
  'creating an IP item request does not reserve stock'
);
reset role;
select is(
  (select quantity from public.inventory_items
   where id = (select inventory_id from flow_ids)),
  10,
  'creating an IP item request leaves available stock unchanged'
);

insert into public.ip_inventory_requests(
  id, ip_ticket_id, requested_by, status, idempotency_key
)
select paid_request_id, ticket_id, (select id from test_actor), 'pending',
  md5('ip-request-flow-request-paid-key')::uuid
from flow_ids
union all
select ticket_request_id, ticket_id, (select id from test_actor), 'pending',
  md5('ip-request-flow-request-ticket-key')::uuid
from flow_ids;

insert into public.ip_inventory_request_items(
  id, request_id, requested_name, requested_quantity
)
select medicine_item_id, paid_request_id, 'Workflow Med', 5 from flow_ids
union all
select inventory_item_id, paid_request_id, 'Workflow Gauze', 3 from flow_ids
union all
select manual_item_id, paid_request_id, 'Off catalog support', 2 from flow_ids
union all
select unavailable_item_id, paid_request_id, 'Outside-only item', 1 from flow_ids
union all
select ticket_item_id, ticket_request_id, 'Workflow Gauze', 1 from flow_ids;

update public.profiles
set role = 'pharmacy', doctor_id = null
where id = (select id from test_actor);

set local role authenticated;

select throws_ok(
  $counter_amount$
  select public.fulfill_ip_inventory_request(
    (select paid_request_id from flow_ids),
    jsonb_build_array(jsonb_build_object(
      'request_item_id', (select medicine_item_id from flow_ids),
      'medicine_id', (select medicine_id from flow_ids),
      'fulfilled_quantity', 1
    )),
    md5('ip-request-flow-counter-amount-mismatch')::uuid,
    99,
    'cash',
    'FLOW-MISMATCH',
    'pharmacy_counter'
  )
  $counter_amount$,
  '23514',
  'pharmacy counter collection must equal supplied items total',
  'counter collection rejects an amount different from the supplied total'
);

select throws_ok(
  $ticket_collection$
  select public.fulfill_ip_inventory_request(
    (select ticket_request_id from flow_ids),
    jsonb_build_array(jsonb_build_object(
      'request_item_id', (select ticket_item_id from flow_ids),
      'inventory_item_id', (select inventory_id from flow_ids),
      'fulfilled_quantity', 1
    )),
    md5('ip-request-flow-ticket-counter-mismatch')::uuid,
    500,
    'cash',
    null,
    'ip_ticket'
  )
  $ticket_collection$,
  '23514',
  'IP-ticket billing cannot collect at the pharmacy counter',
  'IP-ticket settlement rejects a counter collection'
);

select lives_ok(
  $flow$
  select public.fulfill_ip_inventory_request(
    (select paid_request_id from flow_ids),
    jsonb_build_array(
      jsonb_build_object(
        'request_item_id', (select medicine_item_id from flow_ids),
        'medicine_id', (select medicine_id from flow_ids),
        'fulfilled_quantity', 4
      ),
      jsonb_build_object(
        'request_item_id', (select inventory_item_id from flow_ids),
        'inventory_item_id', (select inventory_id from flow_ids),
        'fulfilled_quantity', 2
      ),
      jsonb_build_object(
        'request_item_id', (select manual_item_id from flow_ids),
        'fulfilled_quantity', 1,
        'unit_price_paise', 300
      ),
      jsonb_build_object(
        'request_item_id', (select unavailable_item_id from flow_ids),
        'fulfilled_quantity', 0
      )
    ),
    (select paid_key from flow_ids),
    1900,
    'cash',
    'FLOW-CASH',
    'pharmacy_counter'
  )
  $flow$,
  'medicine, inventory, manual and unavailable lines fulfil atomically'
);

reset role;

select is(
  (select quantity from public.inventory_items
   where id = (select inventory_id from flow_ids)),
  8,
  'only the fulfilled inventory quantity is removed'
);
select is(
  (select quantity from public.medicine_batches
   where id = (select batch_one_id from flow_ids)),
  0,
  'medicine FEFO consumes the earliest batch first'
);
select is(
  (select quantity from public.medicine_batches
   where id = (select batch_two_id from flow_ids)),
  8,
  'medicine FEFO consumes only the remaining fulfilled quantity'
);
select is(
  (select amount_paise from public.ip_inventory_request_items
   where id = (select medicine_item_id from flow_ids)),
  600::bigint,
  'medicine line stores the exact cross-batch amount'
);
select is(
  (select amount_paise from public.ip_inventory_request_items
   where id = (select inventory_item_id from flow_ids)),
  1000::bigint,
  'inventory line uses its locked catalog price'
);
select is(
  (select amount_paise from public.ip_inventory_request_items
   where id = (select manual_item_id from flow_ids)),
  300::bigint,
  'off-catalog line uses the explicit manual price'
);
select is(
  (select status from public.ip_inventory_request_items
   where id = (select unavailable_item_id from flow_ids)),
  'unavailable',
  'quantity zero records an unavailable line'
);
select is(
  (select count(*) from public.ip_charges
   where source_type = 'ip_inventory_request'
     and source_id = (select paid_request_id from flow_ids)),
  0::bigint,
  'counter collection creates no IP pharmacy charge'
);
select is(
  (select counter_collected_paise from public.ip_inventory_requests
   where id = (select paid_request_id from flow_ids)),
  1900::bigint,
  'counter collection stores the exact supplied total outside the IP ledger'
);
select is(
  (select settlement from public.ip_inventory_requests
   where id = (select paid_request_id from flow_ids)),
  'pharmacy_counter',
  'counter collection has an explicit non-IP settlement destination'
);
select is(
  (select payment_id from public.ip_inventory_requests
   where id = (select paid_request_id from flow_ids)),
  null::uuid,
  'counter collection never links an IP payment'
);
select is(
  (
    select
      coalesce((
        select sum(charge.amount_paise)::bigint
        from public.ip_charges charge
        where charge.ip_ticket_id = (select ticket_id from flow_ids)
      ), 0)
      - coalesce((
        select sum(payment.amount_paise)::bigint
        from public.ip_payments payment
        where payment.ip_ticket_id = (select ticket_id from flow_ids)
      ), 0)
  ),
  0::bigint,
  'counter collection leaves the IP running-bill balance unchanged'
);

set local role authenticated;
select lives_ok(
  $retry$
  select public.fulfill_ip_inventory_request(
    (select paid_request_id from flow_ids),
    '[]'::jsonb,
    (select paid_key from flow_ids),
    1900,
    'cash',
    'FLOW-CASH',
    'pharmacy_counter'
  )
  $retry$,
  'retry returns the completed request without another mutation'
);
select throws_ok(
  $mismatched_retry$
  select public.fulfill_ip_inventory_request(
    (select paid_request_id from flow_ids),
    '[]'::jsonb,
    (select paid_key from flow_ids),
    0,
    'cash',
    null,
    'ip_ticket'
  )
  $mismatched_retry$,
  '23514',
  'request was already fulfilled with a different settlement',
  'a retry cannot report a different settlement from the saved request'
);
reset role;

select is(
  (select quantity from public.inventory_items
   where id = (select inventory_id from flow_ids)),
  8,
  'retry does not deplete inventory again'
);
select is(
  (select sum(quantity) from public.medicine_batches
   where medicine_id = (select medicine_id from flow_ids)),
  8::bigint,
  'retry does not deplete medicine again'
);
select is(
  (select count(*) from public.ip_charges
   where source_type = 'ip_inventory_request'
     and source_id = (select paid_request_id from flow_ids)),
  0::bigint,
  'retry does not create an IP charge for a counter collection'
);
select is(
  (select count(*) from public.ip_payments
   where idempotency_key = (select paid_key from flow_ids)),
  0::bigint,
  'counter collection creates no IP payment on retry'
);

update public.ip_tickets
set status = 'discharged'
where id = (select ticket_id from flow_ids);

set local role authenticated;
select throws_ok(
  $discharged_ticket$
  select public.fulfill_ip_inventory_request(
    (select ticket_request_id from flow_ids),
    jsonb_build_array(jsonb_build_object(
      'request_item_id', (select ticket_item_id from flow_ids),
      'inventory_item_id', (select inventory_id from flow_ids),
      'fulfilled_quantity', 1
    )),
    (select ticket_key from flow_ids),
    0,
    'cash',
    null,
    'ip_ticket'
  )
  $discharged_ticket$,
  '23514',
  'IP ticket is not active',
  'ticket settlement cannot change a discharged IP bill'
);
reset role;
select is(
  (select status from public.ip_inventory_requests
   where id = (select ticket_request_id from flow_ids)),
  'pending',
  'a rejected discharged-ticket fulfilment leaves the request pending'
);

update public.ip_tickets
set status = 'admitted'
where id = (select ticket_id from flow_ids);

set local role authenticated;
select lives_ok(
  $ticket$
  select public.fulfill_ip_inventory_request(
    (select ticket_request_id from flow_ids),
    jsonb_build_array(jsonb_build_object(
      'request_item_id', (select ticket_item_id from flow_ids),
      'inventory_item_id', (select inventory_id from flow_ids),
      'fulfilled_quantity', 1
    )),
    (select ticket_key from flow_ids),
    0,
    'cash',
    null,
    'ip_ticket'
  )
  $ticket$,
  'ticket settlement fulfils without a counter collection'
);
reset role;

select is(
  (select quantity from public.inventory_items
   where id = (select inventory_id from flow_ids)),
  7,
  'ticket settlement still removes exactly the supplied stock'
);
select is(
  (select amount_paise from public.ip_charges
   where source_type = 'ip_inventory_request'
     and source_id = (select ticket_request_id from flow_ids)),
  500::bigint,
  'ticket settlement creates the IP charge'
);
select is(
  (select payment_id from public.ip_inventory_requests
   where id = (select ticket_request_id from flow_ids)),
  null::uuid,
  'ticket settlement creates no payment row'
);

set local role authenticated;
select is(
  (select source from public.list_pharmacy_sales(null, 200, 0)
   where id = (select paid_request_id from flow_ids)),
  'ip_items_collected',
  'sales ledger labels a fully collected IP request'
);
select is(
  (select source from public.list_pharmacy_sales(null, 200, 0)
   where id = (select ticket_request_id from flow_ids)),
  'ip_items',
  'sales ledger labels an amount left on the IP ticket'
);
select is(
  (select total_paise from public.list_pharmacy_sales(null, 200, 0)
   where id = (select paid_request_id from flow_ids)),
  1900::bigint,
  'sales ledger uses the exact stored fulfilled total'
);
select is(
  (select settlement from public.list_ip_inventory_requests('pending', null, 200, 0)
   where request_id = (select paid_request_id from flow_ids)),
  'pharmacy_counter',
  'IP item request ledger identifies the direct pharmacy settlement'
);
select is(
  (
    select jsonb_array_length(receipt.items)
    from public.get_ip_inventory_request_receipt(
      (select paid_request_id from flow_ids)
    ) receipt
  ),
  4,
  'receipt retains every originally requested line, including shortages'
);
select is(
  (
    select item ->> 'outcome'
    from public.get_ip_inventory_request_receipt(
      (select paid_request_id from flow_ids)
    ) receipt
    cross join lateral jsonb_array_elements(receipt.items) as item(value)
    where item.value ->> 'name' = 'Outside-only item'
  ),
  'Unavailable — outside purchase',
  'receipt makes an unavailable item explicit for outside purchase'
);
reset role;

select is(
  (select count(*) from public.ip_charges
   where ip_ticket_id = (select ticket_id from flow_ids)
     and source_type = 'ip_inventory_request'),
  1::bigint,
  'only the IP-ticket settlement contributes an IP charge'
);

update public.profiles
set role = 'admin', doctor_id = null
where id = (select id from test_actor);

set local role authenticated;

select is(
  (public.dashboard_summary() ->> 'collected_today_paise')::bigint,
  (
    select (
      coalesce((
        select sum(payment.amount_paise)
        from public.visit_payments payment
        where (payment.created_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date
      ), 0)
      + coalesce((
        select sum(payment.amount_paise)
        from public.ip_payments payment
        where (payment.created_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date
      ), 0)
      + coalesce((
        select sum(sale.total_paise)
        from public.pharmacy_sales sale
        where sale.source = 'op'
          and (sale.created_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
      ), 0)
      + coalesce((
        select sum(request.counter_collected_paise)
        from public.ip_inventory_requests request
        where request.settlement = 'pharmacy_counter'
          and (request.counter_collected_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
      ), 0)
    )::bigint
  ),
  'dashboard counts the direct counter receipt once in today\'s collections'
);
select is(
  (public.dashboard_summary() ->> 'ip_collection_paise')::bigint,
  (
    select coalesce(sum(payment.amount_paise), 0)::bigint
    from public.ip_payments payment
    where (payment.created_at at time zone 'Asia/Kolkata')::date =
      (now() at time zone 'Asia/Kolkata')::date
  ),
  'direct counter receipt does not inflate IP collections'
);
select is(
  (
    select count(*)
    from public.dashboard_metric_detail_for_role(
      'collected_today_paise',
      100
    ) detail
    where detail.href = '/print/ip-items/' || (
      select paid_request_id::text from flow_ids
    )
      and detail.secondary_text like 'Pharmacy counter · %'
  ),
  1::bigint,
  'collected-today drill-down shows the direct receipt once as pharmacy collection'
);
select is(
  (
    select count(*)
    from public.dashboard_metric_detail_for_role(
      'collected_today_paise',
      100
    ) detail
    where detail.href = '/print/ip-items/' || (
      select paid_request_id::text from flow_ids
    )
      and detail.secondary_text like 'IP payment · %'
  ),
  0::bigint,
  'collected-today drill-down never labels the direct receipt as an IP payment'
);
select is(
  (
    public.report_admin_overview(
      (now() at time zone 'Asia/Kolkata')::date,
      (now() at time zone 'Asia/Kolkata')::date
    ) ->> 'pharmacy_collected_paise'
  )::bigint,
  (
    select (
      coalesce((
        select sum(sale.total_paise)
        from public.pharmacy_sales sale
        where sale.source = 'op'
          and (sale.created_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
      ), 0)
      + coalesce((
        select sum(request.counter_collected_paise)
        from public.ip_inventory_requests request
        where request.settlement = 'pharmacy_counter'
          and (request.counter_collected_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
      ), 0)
    )::bigint
  ),
  'admin analytics counts a direct IP counter receipt as pharmacy collection once'
);
select is(
  (
    with day as (
      select (now() at time zone 'Asia/Kolkata')::date as metric_date
    )
    select (series.value ->> 'amount_paise')::bigint
    from day
    cross join lateral jsonb_array_elements(
      public.report_admin_overview(day.metric_date, day.metric_date)
        -> 'pharmacy_sales_by_day'
    ) as series(value)
    where series.value ->> 'date' = day.metric_date::text
  ),
  (
    select (
      coalesce((
        select sum(sale.total_paise)
        from public.pharmacy_sales sale
        where (sale.created_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date
      ), 0)
      + coalesce((
        select sum(item.amount_paise)
        from public.ip_inventory_requests request
        join public.ip_inventory_request_items item on item.request_id = request.id
        where item.status = 'fulfilled'
          and (request.fulfilled_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
      ), 0)
    )::bigint
  ),
  'pharmacy sales trend includes every fulfilled IP request value once'
);
select is(
  (
    with day as (
      select (now() at time zone 'Asia/Kolkata')::date as metric_date
    )
    select (series.value ->> 'items')::bigint
    from day
    cross join lateral jsonb_array_elements(
      public.report_admin_overview(day.metric_date, day.metric_date)
        -> 'pharmacy_sales_by_day'
    ) as series(value)
    where series.value ->> 'date' = day.metric_date::text
  ),
  (
    select (
      coalesce((
        select sum(sale_item.quantity)
        from public.pharmacy_sales sale
        left join public.pharmacy_sale_items sale_item on sale_item.sale_id = sale.id
        where (sale.created_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date
      ), 0)
      + coalesce((
        select sum(item.fulfilled_quantity)
        from public.ip_inventory_requests request
        join public.ip_inventory_request_items item on item.request_id = request.id
        where item.status = 'fulfilled'
          and (request.fulfilled_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
      ), 0)
    )::bigint
  ),
  'pharmacy sales trend includes fulfilled IP item quantities once'
);
select ok(
  (
    select activity.dispenses >= 1
    from public.report_staff_activity(
      (now() at time zone 'Asia/Kolkata')::date,
      (now() at time zone 'Asia/Kolkata')::date
    ) activity
    where activity.profile_id = (select id from test_actor)
  ),
  'staff activity counts the direct IP counter fulfilment as pharmacy work'
);
select ok(
  (
    select activity.dispensed_paise >= 1900
    from public.report_staff_activity(
      (now() at time zone 'Asia/Kolkata')::date,
      (now() at time zone 'Asia/Kolkata')::date
    ) activity
    where activity.profile_id = (select id from test_actor)
  ),
  'staff activity includes the direct IP counter fulfilment value'
);
reset role;

select * from finish();
rollback;
