begin;

select plan(26);

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
    'FLOW-CASH'
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
  (select amount_paise from public.ip_charges
   where source_type = 'ip_inventory_request'
     and source_id = (select paid_request_id from flow_ids)),
  1900::bigint,
  'one exact IP pharmacy charge is created'
);
select is(
  (select amount_paise from public.ip_payments
   where id = (
     select payment_id from public.ip_inventory_requests
     where id = (select paid_request_id from flow_ids)
   )),
  1900::bigint,
  'collect-now creates one offsetting IP payment'
);
select is(
  (select count(*) from public.ip_payments
   where idempotency_key = (select paid_key from flow_ids)),
  1::bigint,
  'the collection idempotency key is stored once'
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
    'FLOW-CASH'
  )
  $retry$,
  'retry returns the completed request without another mutation'
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
  1::bigint,
  'retry does not duplicate the IP charge'
);
select is(
  (select count(*) from public.ip_payments
   where idempotency_key = (select paid_key from flow_ids)),
  1::bigint,
  'retry does not duplicate the payment'
);

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
    null
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
reset role;

select is(
  (select count(*) from public.ip_charges
   where ip_ticket_id = (select ticket_id from flow_ids)
     and source_type = 'ip_inventory_request'),
  2::bigint,
  'each request contributes exactly one IP charge'
);

select * from finish();
rollback;
