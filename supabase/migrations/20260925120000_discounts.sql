-- Discounts.
--
-- A discount reduces what a patient owes without any money changing hands, so
-- it is recorded in its own append-only ledger -- never by lowering a fee,
-- editing a payment, or rewriting a sale. Every place money is collected can
-- take one: the pharmacy counter (medicines and the doctor fee it collects),
-- a visit payment, an IP payment, an IP item counter collection and a
-- procedure bill.
--
--   * Each bill keeps its gross value. Its discount total is denormalised onto
--     the bill (discount_paise / counter_discount_paise), maintained only by
--     the ledger's own trigger, so every balance is simply
--     gross - discount - payments.
--   * Staff may discount up to hospital_settings.max_discount_percent of the
--     bill (1-100, set by admin). Admin has no limit. Enforced here, in the
--     database, not only in the dialogs.
--   * A discount is never edited or deleted. Admin can void one on a bill that
--     still carries a balance (a visit fee or an open IP ticket); the balance
--     then reopens. Counter bills (pharmacy, IP items, procedures) were
--     settled in cash at the discounted amount, so their discounts are final.
begin;

-- ---------------------------------------------------------------------------
-- Limit setting
-- ---------------------------------------------------------------------------
alter table public.hospital_settings
  add column if not exists max_discount_percent smallint not null default 10;
alter table public.hospital_settings
  drop constraint if exists hospital_settings_max_discount_percent_range;
alter table public.hospital_settings
  add constraint hospital_settings_max_discount_percent_range
  check (max_discount_percent between 1 and 100);
-- hospital_settings uses column grants: every desk reads the limit to guide
-- its dialog; only admin (RLS settings_admin) can change it.
grant select (max_discount_percent) on public.hospital_settings to authenticated;
grant insert (max_discount_percent), update (max_discount_percent)
  on public.hospital_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.discount_reason as enum (
    'senior_citizen', 'staff', 'doctor_advised', 'charity', 'round_off', 'other'
  );
exception when duplicate_object then null;
end $$;

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one bill.
  visit_id uuid references public.visits(id) on delete restrict,
  pharmacy_sale_id uuid references public.pharmacy_sales(id) on delete restrict,
  ip_ticket_id uuid references public.ip_tickets(id) on delete restrict,
  ip_inventory_request_id uuid
    references public.ip_inventory_requests(id) on delete restrict,
  procedure_sale_id uuid references public.procedure_sales(id) on delete restrict,
  source text generated always as (
    case
      when visit_id is not null then 'op_fee'
      when pharmacy_sale_id is not null then 'pharmacy_sale'
      when ip_ticket_id is not null then 'ip_ticket'
      when ip_inventory_request_id is not null then 'ip_counter'
      else 'procedure'
    end
  ) stored,
  -- Nullable only because an unidentified emergency IP ticket has no patient.
  patient_id uuid references public.patients(id) on delete restrict,
  -- The bill value the discount was given against (for the percentage).
  gross_paise bigint not null check (gross_paise > 0),
  amount_paise bigint not null check (amount_paise > 0),
  reason public.discount_reason not null,
  note text,
  given_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete restrict,
  void_reason text,
  constraint discounts_one_bill check (
    num_nonnulls(
      visit_id, pharmacy_sale_id, ip_ticket_id,
      ip_inventory_request_id, procedure_sale_id
    ) = 1
  ),
  constraint discounts_within_gross check (amount_paise <= gross_paise),
  constraint discounts_other_needs_note check (
    reason <> 'other' or length(trim(coalesce(note, ''))) > 0
  ),
  constraint discounts_note_length check (note is null or length(note) <= 300),
  constraint discounts_void_consistent check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (
      voided_at is not null and voided_by is not null
      and length(trim(coalesce(void_reason, ''))) > 0
    )
  )
);

create index discounts_created_idx on public.discounts(created_at desc);
create index discounts_given_by_idx on public.discounts(given_by, created_at desc);
create index discounts_patient_idx on public.discounts(patient_id, created_at desc);
create index discounts_visit_idx on public.discounts(visit_id) where visit_id is not null;
create index discounts_sale_idx on public.discounts(pharmacy_sale_id)
  where pharmacy_sale_id is not null;
create index discounts_ticket_idx on public.discounts(ip_ticket_id)
  where ip_ticket_id is not null;
create index discounts_request_idx on public.discounts(ip_inventory_request_id)
  where ip_inventory_request_id is not null;
create index discounts_procedure_idx on public.discounts(procedure_sale_id)
  where procedure_sale_id is not null;

alter table public.discounts enable row level security;
-- Read only, and only the bills each desk already sees the money for. Every
-- write goes through the security-definer RPCs below; no role can insert,
-- update or delete a discount row directly.
revoke all on public.discounts from anon, authenticated;
grant select on public.discounts to authenticated;
create policy discounts_read on public.discounts for select to authenticated
  using (
    case public.current_app_role()
      when 'admin' then true
      when 'reception' then source = 'op_fee'
      when 'pharmacy' then source in ('op_fee', 'pharmacy_sale', 'ip_counter', 'procedure')
      when 'ip' then source = 'ip_ticket'
      else false
    end
  );

-- ---------------------------------------------------------------------------
-- Denormalised totals on each bill
-- ---------------------------------------------------------------------------
alter table public.visits
  add column if not exists discount_paise bigint not null default 0
    check (discount_paise >= 0 and discount_paise <= fee_paise);
alter table public.ip_tickets
  add column if not exists discount_paise bigint not null default 0
    check (discount_paise >= 0);
alter table public.pharmacy_sales
  add column if not exists discount_paise bigint not null default 0
    check (discount_paise >= 0 and discount_paise <= total_paise);
alter table public.procedure_sales
  add column if not exists discount_paise bigint not null default 0
    check (discount_paise >= 0 and discount_paise <= total_paise);
alter table public.ip_inventory_requests
  add column if not exists counter_discount_paise bigint not null default 0
    check (counter_discount_paise >= 0);

-- visits and ip_tickets use column grants that keep finance columns away from
-- clinical roles; a new column is therefore not selectable by anyone until
-- granted, which is intended -- the discount is read through finance RPCs.
-- pharmacy_sales and procedure_sales are already finance-only by RLS.

-- Only the ledger trigger may move a bill's discount total.
create or replace function public.protect_discount_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_column text := tg_argv[0];
begin
  if coalesce(current_setting('app.discount_sync', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce((to_jsonb(new) ->> v_column)::bigint, 0) <> 0 then
      raise exception 'discounts are recorded through the discount ledger'
        using errcode = '42501';
    end if;
  elsif (to_jsonb(new) -> v_column) is distinct from (to_jsonb(old) -> v_column) then
    raise exception 'discounts are recorded through the discount ledger'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger protect_discount_total before insert or update on public.visits
  for each row execute function public.protect_discount_total('discount_paise');
create trigger protect_discount_total before insert or update on public.ip_tickets
  for each row execute function public.protect_discount_total('discount_paise');
create trigger protect_discount_total before insert or update on public.pharmacy_sales
  for each row execute function public.protect_discount_total('discount_paise');
create trigger protect_discount_total before insert or update on public.procedure_sales
  for each row execute function public.protect_discount_total('discount_paise');
create trigger protect_discount_total before insert or update on public.ip_inventory_requests
  for each row execute function public.protect_discount_total('counter_discount_paise');

-- A discount row is immutable apart from being voided once.
create or replace function public.protect_discount_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.voided_at is not null then
    raise exception 'voided discount is immutable' using errcode = '42501';
  end if;
  if (
    new.id, new.visit_id, new.pharmacy_sale_id, new.ip_ticket_id,
    new.ip_inventory_request_id, new.procedure_sale_id, new.patient_id,
    new.gross_paise, new.amount_paise, new.reason, new.note, new.given_by,
    new.idempotency_key, new.created_at
  ) is distinct from (
    old.id, old.visit_id, old.pharmacy_sale_id, old.ip_ticket_id,
    old.ip_inventory_request_id, old.procedure_sale_id, old.patient_id,
    old.gross_paise, old.amount_paise, old.reason, old.note, old.given_by,
    old.idempotency_key, old.created_at
  ) then
    raise exception 'discount is immutable; void it instead' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger protect_discount_row before update on public.discounts
  for each row execute function public.protect_discount_row();

-- Recompute the owning bill's discount total from the ledger.
create or replace function public.sync_discount_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.discount_sync', 'on', true);
  if new.visit_id is not null then
    update public.visits set discount_paise = (
      select coalesce(sum(amount_paise), 0) from public.discounts
      where visit_id = new.visit_id and voided_at is null
    ) where id = new.visit_id;
  elsif new.pharmacy_sale_id is not null then
    update public.pharmacy_sales set discount_paise = (
      select coalesce(sum(amount_paise), 0) from public.discounts
      where pharmacy_sale_id = new.pharmacy_sale_id and voided_at is null
    ) where id = new.pharmacy_sale_id;
  elsif new.ip_ticket_id is not null then
    update public.ip_tickets set discount_paise = (
      select coalesce(sum(amount_paise), 0) from public.discounts
      where ip_ticket_id = new.ip_ticket_id and voided_at is null
    ) where id = new.ip_ticket_id;
  elsif new.ip_inventory_request_id is not null then
    update public.ip_inventory_requests set counter_discount_paise = (
      select coalesce(sum(amount_paise), 0) from public.discounts
      where ip_inventory_request_id = new.ip_inventory_request_id
        and voided_at is null
    ) where id = new.ip_inventory_request_id;
  else
    update public.procedure_sales set discount_paise = (
      select coalesce(sum(amount_paise), 0) from public.discounts
      where procedure_sale_id = new.procedure_sale_id and voided_at is null
    ) where id = new.procedure_sale_id;
  end if;
  perform set_config('app.discount_sync', 'off', true);
  return null;
end
$$;
create trigger sync_discount_total after insert or update of voided_at
  on public.discounts
  for each row execute function public.sync_discount_total();

-- ---------------------------------------------------------------------------
-- Internal helpers (called only from the security-definer RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.discount_limit_percent()
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select max_discount_percent from public.hospital_settings where id),
    10::smallint
  )
$$;

-- Validates who is discounting, why, and by how much against p_base (the bill
-- value the limit is measured on). Returns the parsed reason.
create or replace function public.discount_assert_allowed(
  p_amount bigint, p_base bigint, p_reason text, p_note text
)
returns public.discount_reason
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
  v_limit smallint;
  v_reason public.discount_reason;
begin
  if v_role is null or v_role not in ('admin', 'reception', 'pharmacy', 'ip') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid discount amount' using errcode = '23514';
  end if;
  if p_base is null or p_base <= 0 or p_amount > p_base then
    raise exception 'discount exceeds bill amount' using errcode = '23514';
  end if;
  if p_reason is null
     or p_reason not in (select unnest(enum_range(null::public.discount_reason))::text)
  then
    raise exception 'discount reason required' using errcode = '23514';
  end if;
  v_reason := p_reason::public.discount_reason;
  if v_reason = 'other' and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'discount note required' using errcode = '23514';
  end if;
  if length(coalesce(p_note, '')) > 300 then
    raise exception 'discount note too long' using errcode = '23514';
  end if;
  if v_role <> 'admin' then
    v_limit := public.discount_limit_percent();
    -- Integer arithmetic: amount/base <= limit/100, no rounding in either
    -- direction.
    if p_amount * 100 > v_limit::bigint * p_base then
      raise exception 'discount exceeds limit of % percent', v_limit
        using errcode = '23514';
    end if;
  end if;
  return v_reason;
end
$$;

create or replace function public.discount_record(
  p_target text, p_target_id uuid, p_patient_id uuid, p_gross bigint,
  p_amount bigint, p_reason public.discount_reason, p_note text, p_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.discounts(
    visit_id, pharmacy_sale_id, ip_ticket_id, ip_inventory_request_id,
    procedure_sale_id, patient_id, gross_paise, amount_paise, reason, note,
    idempotency_key
  ) values (
    case when p_target = 'visit' then p_target_id end,
    case when p_target = 'pharmacy_sale' then p_target_id end,
    case when p_target = 'ip_ticket' then p_target_id end,
    case when p_target = 'ip_counter' then p_target_id end,
    case when p_target = 'procedure' then p_target_id end,
    p_patient_id, p_gross, p_amount, p_reason,
    nullif(trim(coalesce(p_note, '')), ''), p_key
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is not null then
    -- Identifiers and amounts only; the note stays in the ledger.
    insert into public.audit_logs(
      actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      auth.uid(), 'DISCOUNT_APPLIED', 'discount', v_id,
      jsonb_build_object(
        'target', p_target, 'target_id', p_target_id,
        'amount_paise', p_amount, 'gross_paise', p_gross, 'reason', p_reason
      )
    );
  end if;
  return v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Existing money functions, reproduced from the deployed definitions with
-- only the discount changes applied. Those whose parameters or result
-- columns change are dropped first (no database function calls them).
-- ---------------------------------------------------------------------------
drop function if exists public.get_visit_financial_summaries(uuid[]);
drop function if exists public.get_ip_financial_summaries(uuid[]);
drop function if exists public.report_staff_activity(date,date);
drop function if exists public.list_pharmacy_sales(text,integer,integer);
drop function if exists public.get_ip_inventory_request_receipt(uuid);
drop function if exists public.get_procedure_bill_receipt(uuid);
drop function if exists public.list_procedure_sales(text,integer,integer);
drop function if exists public.get_sale_receipt(uuid);
drop function if exists public.dispense_prescription(uuid,jsonb,public.payment_mode,uuid,bigint);
drop function if exists public.create_procedure_sale(uuid,uuid,uuid,text,bigint,jsonb,public.payment_mode,text,uuid);
drop function if exists public.fulfill_ip_inventory_request(uuid,jsonb,uuid,bigint,public.payment_mode,text,text);

-- Visit balance: fee - discount - payments
CREATE OR REPLACE FUNCTION public.visit_consultation_balance(p_prescription_id uuid)
 RETURNS TABLE(visit_id uuid, fee_paise bigint, collected_paise bigint, balance_paise bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('admin','pharmacy','reception') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return query
  select v.id,
         v.fee_paise,
         coalesce(sum(vp.amount_paise),0)::bigint,
         greatest(0, v.fee_paise - v.discount_paise - coalesce(sum(vp.amount_paise),0))::bigint
  from public.prescriptions p
  join public.visits v on v.id = p.visit_id
  left join public.visit_payments vp on vp.visit_id = v.id
  where p.id = p_prescription_id
  group by v.id, v.fee_paise, v.discount_paise;
end $function$;

CREATE OR REPLACE FUNCTION public.prevent_visit_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_fee bigint;v_paid bigint;
begin
 -- A discount settles part of the fee without money changing hands, so the
 -- ceiling for real payments is what remains after it.
 select fee_paise-discount_paise into v_fee from public.visits where id=new.visit_id for update;
 select coalesce(sum(amount_paise),0) into v_paid from public.visit_payments where visit_id=new.visit_id;
 if v_paid+new.amount_paise>v_fee then raise exception 'payment exceeds outstanding visit balance';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.require_settled_op_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_balance bigint;
begin
  if new.source_visit_id is null then return new; end if;
  select v.fee_paise - v.discount_paise - coalesce(sum(vp.amount_paise), 0)
    into v_balance
  from public.visits v
  left join public.visit_payments vp on vp.visit_id = v.id
  where v.id = new.source_visit_id
  group by v.fee_paise, v.discount_paise;
  if coalesce(v_balance, 0) > 0 then
    raise exception 'outstanding OP consultation fee of % paise must be collected before admission', v_balance
      using errcode = '23514';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.get_visit_financial_summaries(p_visit_ids uuid[])
 RETURNS TABLE(visit_id uuid, fee_paise bigint, collected_paise bigint, discount_paise bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.current_app_role() is null
     or public.current_app_role() not in ('admin','reception','op') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return query
  select v.id, v.fee_paise, coalesce(sum(p.amount_paise),0)::bigint, v.discount_paise
  from public.visits v
  left join public.visit_payments p on p.visit_id = v.id
  where v.id = any(p_visit_ids)
  group by v.id;
end $function$;

CREATE OR REPLACE FUNCTION public.list_pending_consultation_fees(p_query text DEFAULT NULL::text, p_days integer DEFAULT 7, p_limit integer DEFAULT 100)
 RETURNS TABLE(visit_id uuid, patient_id uuid, token_number integer, visit_date date, patient_name text, patient_phone text, doctor_name text, fee_paise bigint, collected_paise bigint, balance_paise bigint, has_prescription boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_query text;
begin
  if public.current_app_role() not in ('admin','reception','pharmacy') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  v_query := nullif(trim(coalesce(p_query,'')),'');
  return query
  select v.id,
         v.patient_id,
         v.token_number,
         v.visit_date,
         p.name,
         p.phone_normalized,
         d.display_name,
         v.fee_paise,
         coalesce(paid.total,0)::bigint,
         (v.fee_paise - v.discount_paise - coalesce(paid.total,0))::bigint,
         exists(
           select 1 from public.prescriptions rx
           where rx.visit_id = v.id
             and rx.status in ('pending','partially_dispensed','dispensed')
         )
  from public.visits v
  join public.patients p on p.id = v.patient_id
  join public.doctors d on d.id = v.doctor_id
  left join lateral (
    select sum(vp.amount_paise) as total
    from public.visit_payments vp
    where vp.visit_id = v.id
  ) paid on true
  where v.status = 'completed'
    and v.fee_paise - v.discount_paise > coalesce(paid.total,0)
    and v.visit_date >= ((now() at time zone 'Asia/Kolkata')::date - greatest(p_days,0))
    and (
      v_query is null
      or p.name ilike '%'||v_query||'%'
      or p.phone_normalized like v_query||'%'
      or v.token_number::text = v_query
    )
  order by v.visit_date desc, v.token_number
  limit least(greatest(p_limit,1),200);
end $function$;

CREATE OR REPLACE FUNCTION public.list_pending_prescriptions(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_status_filter text DEFAULT 'pending'::text, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, prescription_number bigint, status text, created_at timestamp with time zone, expires_at timestamp with time zone, visit_id uuid, ip_ticket_id uuid, token_number integer, source text, patient_name text, patient_phone text, doctor_name text, consultation_fee_paise bigint, consultation_balance_paise bigint, items jsonb, latest_sale_id uuid, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_query text; v_statuses public.prescription_status[];
begin
  if public.current_app_role() not in ('admin', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_query := nullif(trim(coalesce(p_query, '')), '');
  v_statuses := case p_status_filter
    when 'completed' then array['dispensed', 'unavailable']::public.prescription_status[]
    when 'all' then array[
      'pending', 'partially_dispensed', 'dispensed',
      'unavailable', 'expired', 'cancelled'
    ]::public.prescription_status[]
    else array['pending', 'partially_dispensed']::public.prescription_status[]
  end;
  return query
  select
    p.id, p.prescription_number, p.status::text, p.created_at,
    (p.created_at + interval '24 hours'), p.visit_id, p.ip_ticket_id,
    v.token_number,
    case when p.ip_ticket_id is not null then 'IP' else 'OP' end,
    coalesce(vp.name, ip.name),
    coalesce(vp.phone_normalized, ip.phone_normalized), d.display_name,
    coalesce(v.fee_paise, 0)::bigint,
    greatest(0, coalesce(v.fee_paise, 0) - coalesce(v.discount_paise, 0) - coalesce(
      (select sum(pay.amount_paise) from public.visit_payments pay where pay.visit_id = v.id), 0
    ))::bigint,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'medicine_id', i.medicine_id,
        'medicine_name', i.medicine_name, 'dose', i.dose,
        'frequency', i.frequency, 'duration', i.duration,
        'route', i.route, 'dosage_form', md.dosage_form,
        'strength', md.strength,
        'requested_quantity', i.requested_quantity,
        'dispensed_quantity', i.dispensed_quantity
      ) order by i.created_at)
      from public.prescription_items i
      left join public.medicine_directory md on md.id = i.medicine_id
      where i.prescription_id = p.id
    ), '[]'::jsonb),
    (select s.id from public.pharmacy_sales s
      where s.prescription_id = p.id order by s.created_at desc limit 1),
    count(*) over()
  from public.prescriptions p
  left join public.visits v on v.id = p.visit_id
  left join public.patients vp on vp.id = v.patient_id
  left join public.ip_tickets t on t.id = p.ip_ticket_id
  left join public.patients ip on ip.id = t.patient_id
  left join public.doctors d on d.id = p.doctor_id
  where (
    p.status = any(v_statuses)
    or (p_status_filter = 'pending' and p.status = 'dispensed'
        and p.updated_at > now() - interval '10 minutes')
  )
    and (
      v_query is null
      or coalesce(vp.name, ip.name) ilike '%' || v_query || '%'
      or coalesce(vp.phone_normalized, ip.phone_normalized) like v_query || '%'
      or v.token_number::text = v_query
      or p.prescription_number::text = regexp_replace(v_query, '\D', '', 'g')
    )
  order by
    case when p_status_filter = 'pending' then v.token_number end nulls last,
    case when p_status_filter <> 'pending' then p.created_at end desc,
    p.created_at
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
end;
$function$;


-- IP balance: charges - discount - payments
CREATE OR REPLACE FUNCTION public.get_ip_financial_summaries(p_ticket_ids uuid[])
 RETURNS TABLE(ticket_id uuid, total_paise bigint, paid_paise bigint, balance_paise bigint, discount_paise bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.current_app_role() is null
     or public.current_app_role() not in ('admin','ip') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ticket_ids), 0) > 100 then
    raise exception 'too many tickets' using errcode = '22023';
  end if;

  return query
  select
    requested.ticket_id,
    coalesce(charges.total_paise, 0)::bigint,
    coalesce(payments.paid_paise, 0)::bigint,
    greatest(
      0,
      coalesce(charges.total_paise, 0) - coalesce(payments.paid_paise, 0)
        - coalesce(ticket.discount_paise, 0)
    )::bigint,
    coalesce(ticket.discount_paise, 0)::bigint
  from unnest(coalesce(p_ticket_ids, array[]::uuid[])) as requested(ticket_id)
  left join lateral (
    select sum(charge.amount_paise)::bigint as total_paise
    from public.ip_charges charge
    where charge.ip_ticket_id = requested.ticket_id
  ) charges on true
  left join lateral (
    select sum(payment.amount_paise)::bigint as paid_paise
    from public.ip_payments payment
    where payment.ip_ticket_id = requested.ticket_id
  ) payments on true
  left join public.ip_tickets ticket on ticket.id = requested.ticket_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.complete_ip_discharge(p_ticket_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role;
  v_patient uuid;
  v_total bigint;
  v_paid bigint;
  v_discount bigint;
begin
  v_role := public.current_app_role();
  if v_role is null or v_role not in ('admin', 'ip') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select patient_id
    into v_patient
  from public.ip_tickets
  where id = p_ticket_id
    and status = 'discharge_pending'
    and final_diagnosis is not null
  for update;
  if not found then
    raise exception 'clinical discharge summary is required';
  end if;
  if v_patient is null then
    raise exception 'patient assignment is required before discharge';
  end if;

  select coalesce(sum(amount_paise), 0)
    into v_total
  from public.ip_charges
  where ip_ticket_id = p_ticket_id;
  select coalesce(sum(amount_paise), 0)
    into v_paid
  from public.ip_payments
  where ip_ticket_id = p_ticket_id;
  -- Discounts settle part of the bill without a payment row.
  select discount_paise into v_discount
  from public.ip_tickets where id = p_ticket_id;
  if v_paid + v_discount < v_total then
    raise exception 'outstanding balance remains';
  end if;

  perform set_config('app.ip_discharge_workflow', 'on', true);
  update public.ip_tickets
  set status = 'discharged', discharge_at = now()
  where id = p_ticket_id;

  insert into public.audit_logs(
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    auth.uid(),
    'IP_DISCHARGED',
    'ip_ticket',
    p_ticket_id,
    jsonb_build_object('total_paise', v_total, 'paid_paise', v_paid, 'discount_paise', v_discount)
  );
  return p_ticket_id;
end
$function$;


-- Counter collections take a discount
CREATE OR REPLACE FUNCTION public.dispense_prescription(p_prescription_id uuid, p_lines jsonb, p_payment_mode payment_mode, p_idempotency_key uuid, p_consultation_collected_paise bigint DEFAULT 0, p_discount_paise bigint DEFAULT 0, p_discount_reason text DEFAULT NULL::text, p_discount_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role;
  v_sale_id uuid;
  v_patient_id uuid;
  v_ip_ticket_id uuid;
  v_source public.sale_source;
  v_line jsonb;
  v_item public.prescription_items%rowtype;
  v_batch public.medicine_batches%rowtype;
  v_qty integer;
  v_total bigint := 0;
  v_remaining integer;
  v_visit_id uuid;
  v_outstanding bigint := 0;
  v_amount bigint;
  v_piece_price bigint;
  v_sale_item_id uuid;
  v_excess integer;
  v_reason public.discount_reason;
  v_sale_discount bigint := 0;
  v_fee_discount bigint := 0;
begin
  v_role := public.current_app_role();
  if v_role is null or v_role not in ('admin', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '23514';
  end if;
  if p_lines is null
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_array_length(p_lines) < 1 then
    raise exception 'at least one dispense line is required' using errcode = '23514';
  end if;
  if coalesce(p_consultation_collected_paise, 0) < 0 then
    raise exception 'invalid consultation payment' using errcode = '23514';
  end if;
  if coalesce(p_discount_paise, 0) < 0 then
    raise exception 'invalid discount amount' using errcode = '23514';
  end if;

  select id into v_sale_id
  from public.pharmacy_sales
  where idempotency_key = p_idempotency_key;
  if v_sale_id is not null then return v_sale_id; end if;

  select
    v.patient_id,
    p.ip_ticket_id,
    p.visit_id,
    case when p.ip_ticket_id is null
      then 'op'::public.sale_source else 'ip'::public.sale_source end
  into v_patient_id, v_ip_ticket_id, v_visit_id, v_source
  from public.prescriptions p
  left join public.visits v on v.id = p.visit_id
  where p.id = p_prescription_id
    and p.status in ('pending', 'partially_dispensed')
    and p.created_at > now() - interval '24 hours'
  for update of p;

  if not found or v_patient_id is null then
    select i.patient_id, p.ip_ticket_id, null::uuid, 'ip'::public.sale_source
    into v_patient_id, v_ip_ticket_id, v_visit_id, v_source
    from public.prescriptions p
    join public.ip_tickets i on i.id = p.ip_ticket_id
    where p.id = p_prescription_id
      and p.status in ('pending', 'partially_dispensed')
      and p.created_at > now() - interval '24 hours'
    for update of p;
  end if;
  if v_patient_id is null then
    raise exception 'prescription expired or unavailable' using errcode = '23514';
  end if;

  -- Collection is not an editable selling price. The consultation form may
  -- save an authorized fee override; dispensing collects that visit's exact
  -- current outstanding value, never a client-selected amount.
  if v_source = 'op' then
    select greatest(0, v.fee_paise - coalesce(sum(vp.amount_paise), 0))
    into v_outstanding
    from public.visits v
    left join public.visit_payments vp on vp.visit_id = v.id
    where v.id = v_visit_id
    group by v.fee_paise;
    if coalesce(p_consultation_collected_paise, 0) <> coalesce(v_outstanding, 0) then
      raise exception 'exact outstanding consultation fee required' using errcode = '23514';
    end if;
  elsif coalesce(p_consultation_collected_paise, 0) <> 0 then
    raise exception 'IP consultation is billed on the ticket' using errcode = '23514';
  end if;

  insert into public.pharmacy_sales(
    prescription_id, patient_id, source, ip_ticket_id, payment_mode, idempotency_key
  ) values (
    p_prescription_id, v_patient_id, v_source, v_ip_ticket_id,
    case when v_source = 'op' then p_payment_mode else null end,
    p_idempotency_key
  ) returning id into v_sale_id;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    if v_line ? 'new_requested_quantity' then
      raise exception 'prescribed quantity cannot be changed at pharmacy'
        using errcode = '23514';
    end if;
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty <= 0 then
      raise exception 'invalid quantity' using errcode = '23514';
    end if;

    select * into v_item
    from public.prescription_items
    where id = (v_line ->> 'prescription_item_id')::uuid
      and prescription_id = p_prescription_id
    for update;
    if not found then
      raise exception 'prescription item not found' using errcode = '23514';
    end if;
    -- The counter may hand over more than was prescribed when the stock is
    -- there. Stock, not the prescription, is the ceiling; the excess is
    -- absorbed into requested_quantity below so dispensed never exceeds it.
    v_excess := greatest(
      0, v_item.dispensed_quantity + v_qty - v_item.requested_quantity
    );

    select * into v_batch
    from public.medicine_batches
    where id = (v_line ->> 'batch_id')::uuid
      and medicine_id = v_item.medicine_id
      and active
    for update;
    if not found or v_batch.quantity < v_qty
       or v_batch.expiry_date < current_date then
      raise exception 'batch stock unavailable' using errcode = '23514';
    end if;

    update public.medicine_batches
    set quantity = quantity - v_qty, updated_at = now()
    where id = v_batch.id;
    -- One statement, so the row never transiently violates the table's
    -- dispensed_quantity <= requested_quantity check. requested_quantity only
    -- ever rises here, which protect_prescription_content() permits.
    update public.prescription_items
    set dispensed_quantity = dispensed_quantity + v_qty,
        requested_quantity = greatest(
          requested_quantity, dispensed_quantity + v_qty
        )
    where id = v_item.id;
    if v_excess > 0 then
      insert into public.audit_logs(
        actor_user_id, action, entity_type, entity_id, metadata
      ) values (
        auth.uid(), 'PRESCRIPTION_QUANTITY_RAISED', 'prescription_item',
        v_item.id,
        jsonb_build_object(
          'prescription_id', p_prescription_id,
          'prescribed_quantity', v_item.requested_quantity,
          'supplied_quantity', v_item.dispensed_quantity + v_qty,
          'excess_quantity', v_excess
        )
      );
    end if;

    v_amount := round(
      v_qty::numeric * v_batch.selling_price_paise
      / greatest(v_batch.units_per_pack, 1)
    );
    v_piece_price := round(
      v_batch.selling_price_paise::numeric
      / greatest(v_batch.units_per_pack, 1)
    );
    insert into public.pharmacy_sale_items(
      sale_id, prescription_item_id, batch_id, quantity,
      unit_price_paise, amount_paise
    ) values (
      v_sale_id, v_item.id, v_batch.id, v_qty,
      v_piece_price, v_amount
    ) returning id into v_sale_item_id;
    -- v_batch was read under `for update` before the decrement above, so
    -- v_batch.quantity is the quantity this movement started from. Recording
    -- it (and the sale it came from) is what lets the ledger be replayed and
    -- reconciled against the batch instead of merely summed.
    insert into public.stock_movements(
      batch_id, quantity_delta, reason, idempotency_key,
      source_type, source_id, quantity_before, quantity_after
    ) values (
      v_batch.id, -v_qty, 'Prescription dispense', v_sale_item_id,
      'pharmacy_sale', v_sale_id, v_batch.quantity, v_batch.quantity - v_qty
    );
    v_total := v_total + v_amount;
  end loop;

  update public.pharmacy_sales set total_paise = v_total where id = v_sale_id;

  -- One counter discount covers the whole bill the patient is paying now.
  -- It comes off the medicines first and only then off the doctor fee, and
  -- each share is recorded against the bill it reduces so the pharmacy and
  -- the visit keep their own honest balances. IP medicines are billed to the
  -- ticket, so any IP discount is given on the IP bill instead.
  if coalesce(p_discount_paise, 0) > 0 then
    if v_source <> 'op' then
      raise exception 'IP pharmacy is billed on the ticket' using errcode = '23514';
    end if;
    v_reason := public.discount_assert_allowed(
      p_discount_paise, v_total + v_outstanding, p_discount_reason, p_discount_note
    );
    v_sale_discount := least(p_discount_paise, v_total);
    v_fee_discount := p_discount_paise - v_sale_discount;
    if v_sale_discount > 0 then
      perform public.discount_record(
        'pharmacy_sale', v_sale_id, v_patient_id, v_total, v_sale_discount,
        v_reason, p_discount_note,
        md5(p_idempotency_key::text || ':sale_discount')::uuid
      );
    end if;
    if v_fee_discount > 0 then
      perform public.discount_record(
        'visit', v_visit_id, v_patient_id,
        (select fee_paise from public.visits where id = v_visit_id),
        v_fee_discount, v_reason, p_discount_note,
        md5(p_idempotency_key::text || ':visit_fee_discount')::uuid
      );
    end if;
  end if;
  select count(*) into v_remaining
  from public.prescription_items
  where prescription_id = p_prescription_id
    and dispensed_quantity < requested_quantity;
  update public.prescriptions
  set status = case when v_remaining = 0
    then 'dispensed'::public.prescription_status
    else 'partially_dispensed'::public.prescription_status end
  where id = p_prescription_id;

  if v_source = 'ip' then
    insert into public.ip_charges(
      ip_ticket_id, category, item, quantity, rate_paise,
      source_type, source_id, idempotency_key
    ) values (
      v_ip_ticket_id, 'pharmacy', 'Pharmacy medicines', 1, v_total,
      'pharmacy_sale', v_sale_id, p_idempotency_key
    );
  elsif v_outstanding - v_fee_discount > 0 then
    insert into public.visit_payments(
      visit_id, amount_paise, mode, notes, idempotency_key
    ) values (
      v_visit_id, v_outstanding - v_fee_discount, p_payment_mode,
      'Collected at pharmacy counter', p_idempotency_key
    );
    insert into public.audit_logs(
      actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      auth.uid(), 'PAYMENT_ADDED', 'visit', v_visit_id,
      jsonb_build_object(
        'amount_paise', v_outstanding - v_fee_discount, 'source', 'pharmacy'
      )
    );
  end if;

  insert into public.audit_logs(
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), 'PHARMACY_DISPENSED', 'pharmacy_sale', v_sale_id,
    jsonb_build_object(
      'amount_paise', v_total,
      'discount_paise', v_sale_discount + v_fee_discount
    )
  );
  return v_sale_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_procedure_sale(p_patient_id uuid, p_visit_id uuid, p_doctor_id uuid, p_procedure_name text, p_procedure_fee_paise bigint, p_lines jsonb, p_payment_mode payment_mode, p_notes text, p_idempotency_key uuid, p_discount_paise bigint DEFAULT 0, p_discount_reason text DEFAULT NULL::text, p_discount_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sale_id uuid;
  v_line jsonb;
  v_item public.inventory_items%rowtype;
  v_qty integer;
  v_items_total bigint := 0;
  v_line_index integer := 0;
  v_reason public.discount_reason;
  v_billed_to_ip boolean;
begin
  if public.current_app_role() not in ('admin', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(trim(p_procedure_name), '') = '' then
    raise exception 'procedure name required' using errcode = '23514';
  end if;
  if p_procedure_fee_paise < 0 then
    raise exception 'invalid procedure fee' using errcode = '23514';
  end if;
  if coalesce(p_discount_paise, 0) < 0 then
    raise exception 'invalid discount amount' using errcode = '23514';
  end if;

  select id into v_sale_id
  from public.procedure_sales
  where idempotency_key = p_idempotency_key;
  if v_sale_id is not null then return v_sale_id; end if;

  insert into public.procedure_sales(
    patient_id, visit_id, doctor_id, procedure_name, procedure_fee_paise,
    payment_mode, notes, idempotency_key
  ) values (
    p_patient_id,
    nullif(p_visit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_doctor_id, trim(p_procedure_name), p_procedure_fee_paise,
    p_payment_mode, nullif(trim(coalesce(p_notes, '')), ''), p_idempotency_key
  ) returning id into v_sale_id;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_index := v_line_index + 1;
    v_qty := (v_line ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity' using errcode = '23514';
    end if;
    select * into v_item
    from public.inventory_items
    where id = (v_line ->> 'inventory_item_id')::uuid and active
    for update;
    if not found then
      raise exception 'inventory item unavailable' using errcode = '23514';
    end if;
    if v_item.quantity < v_qty then
      raise exception 'insufficient inventory stock' using errcode = '23514';
    end if;

    update public.inventory_items
    set quantity = quantity - v_qty, updated_at = now()
    where id = v_item.id;
    insert into public.procedure_sale_items(
      sale_id, inventory_item_id, quantity, unit_price_paise
    ) values (v_sale_id, v_item.id, v_qty, v_item.selling_price_paise);
    insert into public.inventory_stock_movements(
      inventory_item_id, quantity_delta, quantity_before, quantity_after,
      reason, source_type, source_id, idempotency_key
    ) values (
      v_item.id, -v_qty, v_item.quantity, v_item.quantity - v_qty,
      'Procedure supply', 'procedure_sale', v_sale_id,
      md5('procedure_sale:' || v_sale_id::text || ':line:' || v_line_index)::uuid
    );
    v_items_total := v_items_total + (v_qty * v_item.selling_price_paise);
  end loop;

  update public.procedure_sales
  set items_total_paise = v_items_total,
      total_paise = v_items_total + p_procedure_fee_paise
  where id = v_sale_id;

  insert into public.ip_charges(
    ip_ticket_id, category, item, quantity, rate_paise,
    source_type, source_id, idempotency_key
  )
  select t.id, 'treatment', trim(p_procedure_name), 1,
    v_items_total + p_procedure_fee_paise,
    'procedure_sale', v_sale_id, p_idempotency_key
  from public.ip_tickets t
  where t.patient_id = p_patient_id
    and t.status in ('admitted', 'discharge_pending')
  limit 1;

  update public.procedure_sales sale
  set ip_ticket_id = charge.ip_ticket_id, payment_mode = null
  from public.ip_charges charge
  where charge.source_id = v_sale_id
    and charge.source_type = 'procedure_sale'
    and sale.id = v_sale_id;

  -- A procedure billed to an admitted patient's ticket is discounted on the
  -- IP bill; only a bill settled here at the counter takes a discount here.
  if coalesce(p_discount_paise, 0) > 0 then
    select ip_ticket_id is not null into v_billed_to_ip
    from public.procedure_sales where id = v_sale_id;
    if v_billed_to_ip then
      raise exception 'procedure is billed on the IP ticket' using errcode = '23514';
    end if;
    v_reason := public.discount_assert_allowed(
      p_discount_paise, v_items_total + p_procedure_fee_paise,
      p_discount_reason, p_discount_note
    );
    perform public.discount_record(
      'procedure', v_sale_id, p_patient_id, v_items_total + p_procedure_fee_paise,
      p_discount_paise, v_reason, p_discount_note,
      md5(p_idempotency_key::text || ':procedure_discount')::uuid
    );
  end if;

  insert into public.audit_logs(
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), 'PROCEDURE_SALE_CREATED', 'procedure_sale', v_sale_id,
    jsonb_build_object(
      'total_paise', v_items_total + p_procedure_fee_paise,
      'items', jsonb_array_length(coalesce(p_lines, '[]'::jsonb))
    )
  );
  return v_sale_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.fulfill_ip_inventory_request(p_request_id uuid, p_lines jsonb, p_idempotency_key uuid, p_collected_paise bigint DEFAULT 0, p_payment_mode payment_mode DEFAULT NULL::payment_mode, p_reference text DEFAULT NULL::text, p_settlement text DEFAULT NULL::text, p_discount_paise bigint DEFAULT 0, p_discount_reason text DEFAULT NULL::text, p_discount_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_batch_snapshot jsonb := '[]'::jsonb;
  v_inventory_snapshot jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_stock_id uuid;
  v_before integer;
  v_after integer;
  v_result uuid;
  v_request public.ip_inventory_requests%rowtype;
  v_reason public.discount_reason;
  v_discount_key uuid;
  v_patient_id uuid;
begin
  if public.current_app_role() not in ('admin', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(p_discount_paise, 0) < 0 then
    raise exception 'invalid discount amount' using errcode = '23514';
  end if;
  -- Match the legacy function's request lock order before taking stock locks.
  perform 1
  from public.ip_inventory_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception 'request unavailable' using errcode = '42501';
  end if;

  -- Lock every possible source first. The original transactional fulfilment
  -- will then consume its normal FEFO selection while no concurrent dispense
  -- can alter the quantities between the two snapshots.
  with locked_batches as (
    select batch.id, batch.quantity
    from public.medicine_batches batch
    where batch.medicine_id in (
      select distinct nullif(line.value ->> 'medicine_id', '')::uuid
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line(value)
      where nullif(line.value ->> 'medicine_id', '') is not null
    )
      and batch.active
      and batch.quantity > 0
      and batch.expiry_date >= current_date
    for update
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'quantity', quantity)),
    '[]'::jsonb
  ) into v_batch_snapshot
  from locked_batches;

  with locked_inventory as (
    select item.id, item.quantity
    from public.inventory_items item
    where item.id in (
      select distinct nullif(line.value ->> 'inventory_item_id', '')::uuid
      from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line(value)
      where nullif(line.value ->> 'inventory_item_id', '') is not null
    )
      and item.active
      and (item.expiry_date is null or item.expiry_date >= current_date)
    for update
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('id', id, 'quantity', quantity)),
    '[]'::jsonb
  ) into v_inventory_snapshot
  from locked_inventory;

  v_result := public.fulfill_ip_inventory_request_without_stock_ledger(
    p_request_id, p_lines, p_idempotency_key, p_collected_paise,
    p_payment_mode, p_reference, p_settlement
  );

  -- The counter bill stays recorded at its full value (the settlement the
  -- fulfilment above validated); a discount is its own ledger row, so the
  -- cash actually taken is counter_collected_paise - counter_discount_paise.
  if coalesce(p_discount_paise, 0) > 0 then
    v_discount_key := md5(p_idempotency_key::text || ':ip_counter_discount')::uuid;
    if not exists (
      select 1 from public.discounts where idempotency_key = v_discount_key
    ) then
      select * into v_request
      from public.ip_inventory_requests
      where id = p_request_id;
      if v_request.settlement is distinct from 'pharmacy_counter' then
        raise exception 'discount requires pharmacy counter collection'
          using errcode = '23514';
      end if;
      -- Only the fulfilment made in this call may be discounted; a replay of
      -- an earlier fulfilment must not add a discount after the fact.
      if v_request.fulfilled_at is distinct from now() then
        raise exception 'request was already fulfilled with a different settlement'
          using errcode = '23514';
      end if;
      v_reason := public.discount_assert_allowed(
        p_discount_paise, v_request.counter_collected_paise,
        p_discount_reason, p_discount_note
      );
      select patient_id into v_patient_id
      from public.ip_tickets where id = v_request.ip_ticket_id;
      perform public.discount_record(
        'ip_counter', p_request_id, v_patient_id,
        v_request.counter_collected_paise, p_discount_paise, v_reason,
        p_discount_note, v_discount_key
      );
    end if;
  end if;

  for v_snapshot in select value from jsonb_array_elements(v_batch_snapshot) loop
    v_stock_id := (v_snapshot ->> 'id')::uuid;
    v_before := (v_snapshot ->> 'quantity')::integer;
    select quantity into v_after
    from public.medicine_batches
    where id = v_stock_id;
    if v_after is distinct from v_before then
      insert into public.stock_movements(
        batch_id, quantity_delta, reason, idempotency_key,
        source_type, source_id, quantity_before, quantity_after
      ) values (
        v_stock_id, v_after - v_before, 'IP pharmacy request supply',
        md5('ip_inventory_request:' || p_request_id::text || ':batch:' || v_stock_id::text)::uuid,
        'ip_inventory_request', p_request_id, v_before, v_after
      );
    end if;
  end loop;

  for v_snapshot in select value from jsonb_array_elements(v_inventory_snapshot) loop
    v_stock_id := (v_snapshot ->> 'id')::uuid;
    v_before := (v_snapshot ->> 'quantity')::integer;
    select quantity into v_after
    from public.inventory_items
    where id = v_stock_id;
    if v_after is distinct from v_before then
      insert into public.inventory_stock_movements(
        inventory_item_id, quantity_delta, quantity_before, quantity_after,
        reason, source_type, source_id, idempotency_key
      ) values (
        v_stock_id, v_after - v_before, v_before, v_after,
        'IP pharmacy request supply', 'ip_inventory_request', p_request_id,
        md5('ip_inventory_request:' || p_request_id::text || ':inventory:' || v_stock_id::text)::uuid
      );
    end if;
  end loop;

  return v_result;
end
$function$;


-- Receipts and lists show the discount
CREATE OR REPLACE FUNCTION public.get_sale_receipt(p_sale_id uuid)
 RETURNS TABLE(sale_id uuid, created_at timestamp with time zone, source text, payment_mode text, dispensed_by text, patient_name text, patient_phone text, patient_uhid text, visit_id uuid, token_number integer, prescription_id uuid, prescription_number bigint, doctor_name text, medicines_paise bigint, consultation_paise bigint, items jsonb, unsupplied jsonb, medicines_discount_paise bigint, consultation_discount_paise bigint, discount_reason text, discount_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.current_app_role() is null
     or public.current_app_role() not in ('admin','pharmacy','reception') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return query
  select
    s.id, s.created_at, s.source::text, s.payment_mode::text, pr.full_name,
    pt.name, pt.phone_normalized, pt.uhid, v.id, v.token_number,
    rx.id, rx.prescription_number, d.display_name,
    coalesce(s.total_paise,0)::bigint,
    coalesce((select sum(vp.amount_paise) from public.visit_payments vp
              where vp.idempotency_key = s.idempotency_key),0)::bigint,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'name', i.medicine_name,
                  'batch', b.batch_number,
                  'quantity', si.quantity,
                  'units_per_pack', coalesce(b.units_per_pack,1),
                  'unit_price_paise', si.unit_price_paise,
                  'amount_paise', si.amount_paise
                )
                order by i.medicine_name)
       from public.pharmacy_sale_items si
       join public.prescription_items i on i.id = si.prescription_item_id
       left join public.medicine_batches b on b.id = si.batch_id
       where si.sale_id = s.id),
      '[]'::jsonb
    ),
    -- What this prescription still owes the patient: a line never dispensed
    -- at all, and the unmet balance of a partly dispensed one.
    coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'name', i.medicine_name,
                  'dose', i.dose,
                  'frequency', i.frequency,
                  'duration', i.duration,
                  'pending', i.requested_quantity - coalesce(i.dispensed_quantity,0)
                )
                order by i.medicine_name)
       from public.prescription_items i
       where i.prescription_id = s.prescription_id
         and i.requested_quantity - coalesce(i.dispensed_quantity,0) > 0),
      '[]'::jsonb
    )
    , s.discount_paise,
    -- The doctor-fee share of a counter discount is recorded against the
    -- visit (it reduces the visit's own balance) under a key derived from
    -- the sale's, which is how it is found again here.
    coalesce((select fee_discount.amount_paise from public.discounts fee_discount
              where fee_discount.idempotency_key =
                md5(s.idempotency_key::text || ':visit_fee_discount')::uuid
                and fee_discount.voided_at is null), 0)::bigint,
    counter_discount.reason::text,
    counter_discount.note
  from public.pharmacy_sales s
  left join lateral (
    select discount.reason, discount.note
    from public.discounts discount
    where discount.idempotency_key in (
      md5(s.idempotency_key::text || ':sale_discount')::uuid,
      md5(s.idempotency_key::text || ':visit_fee_discount')::uuid
    )
    order by discount.created_at
    limit 1
  ) counter_discount on true
  left join public.profiles pr on pr.id = s.dispensed_by
  left join public.patients pt on pt.id = s.patient_id
  left join public.prescriptions rx on rx.id = s.prescription_id
  left join public.visits v on v.id = rx.visit_id
  left join public.doctors d on d.id = rx.doctor_id
  where s.id = p_sale_id;
end $function$;

CREATE OR REPLACE FUNCTION public.list_pharmacy_sales(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, source text, total_paise bigint, discount_paise bigint, patient_name text, patient_phone text, dispensed_by text, item_count bigint, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role;
  v_query text;
  v_digits text;
begin
  v_role := public.current_app_role();
  if v_role is null or v_role not in ('admin', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_query := nullif(trim(coalesce(p_query, '')), '');
  v_digits := regexp_replace(coalesce(v_query, ''), '\D', '', 'g');

  return query
  with activity as (
    select
      sale.id,
      sale.created_at,
      sale.source::text as source,
      sale.total_paise,
      sale.discount_paise,
      patient.name::text as patient_name,
      patient.phone_normalized::text as patient_phone,
      profile.full_name::text as dispensed_by,
      (
        select count(*)
        from public.pharmacy_sale_items sale_item
        where sale_item.sale_id = sale.id
      )::bigint as item_count
    from public.pharmacy_sales sale
    left join public.patients patient on patient.id = sale.patient_id
    left join public.profiles profile on profile.id = sale.dispensed_by

    union all

    select
      request.id,
      request.fulfilled_at as created_at,
      case
        when request.settlement = 'pharmacy_counter'
          then 'ip_items_collected'
        when coalesce(payment.amount_paise, 0) >= lines.total_paise
          and lines.total_paise > 0 then 'ip_items_legacy_collected'
        when coalesce(payment.amount_paise, 0) > 0 then 'ip_items_partial'
        else 'ip_items'
      end::text as source,
      lines.total_paise,
      request.counter_discount_paise as discount_paise,
      patient.name::text as patient_name,
      patient.phone_normalized::text as patient_phone,
      profile.full_name::text as dispensed_by,
      lines.item_count
    from public.ip_inventory_requests request
    join public.ip_tickets ticket on ticket.id = request.ip_ticket_id
    left join public.patients patient on patient.id = ticket.patient_id
    left join public.profiles profile on profile.id = request.fulfilled_by
    left join public.ip_payments payment on payment.id = request.payment_id
    cross join lateral (
      select
        coalesce(sum(item.amount_paise), 0)::bigint as total_paise,
        count(*) filter (
          where item.status = 'fulfilled' and item.fulfilled_quantity > 0
        )::bigint as item_count
      from public.ip_inventory_request_items item
      where item.request_id = request.id
        and item.status = 'fulfilled'
    ) lines
    where request.fulfilled_at is not null
      and lines.item_count > 0
  ), matched as (
    select activity.*
    from activity
    where v_query is null
       or activity.patient_name ilike '%' || v_query || '%'
       or (
         v_digits <> ''
         and activity.patient_phone like right(v_digits, 10) || '%'
       )
  )
  select
    matched.id,
    matched.created_at,
    matched.source,
    matched.total_paise,
    matched.discount_paise,
    matched.patient_name,
    matched.patient_phone,
    matched.dispensed_by,
    matched.item_count,
    count(*) over () as total_count
  from matched
  order by matched.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset least(greatest(coalesce(p_offset, 0), 0), 100000);
end
$function$;

CREATE OR REPLACE FUNCTION public.get_procedure_bill_receipt(p_sale_id uuid)
 RETURNS TABLE(sale_id uuid, sale_number integer, created_at timestamp with time zone, procedure_name text, procedure_fee_paise bigint, items_total_paise bigint, total_paise bigint, discount_paise bigint, discount_reason text, payment_mode text, ip_ticket_id uuid, patient_name text, patient_phone text, patient_uhid text, doctor_name text, billed_by text, items jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.current_app_role() not in ('admin','pharmacy') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return query
  select
    s.id, s.sale_number, s.created_at, s.procedure_name, s.procedure_fee_paise,
    s.items_total_paise, s.total_paise, s.discount_paise,
    (select discount.reason::text from public.discounts discount
      where discount.procedure_sale_id = s.id and discount.voided_at is null
      order by discount.created_at limit 1),
    s.payment_mode::text, s.ip_ticket_id,
    pt.name, pt.phone_normalized, pt.uhid, d.display_name, pr.full_name,
    coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'name', inv.name,
                  'quantity', si.quantity,
                  'unit_price_paise', si.unit_price_paise,
                  'amount_paise', si.quantity * si.unit_price_paise
                )
                order by inv.name)
       from public.procedure_sale_items si
       join public.inventory_items inv on inv.id = si.inventory_item_id
       where si.sale_id = s.id),
      '[]'::jsonb
    )
  from public.procedure_sales s
  left join public.patients pt on pt.id = s.patient_id
  left join public.doctors d on d.id = s.doctor_id
  left join public.profiles pr on pr.id = s.created_by
  where s.id = p_sale_id;
end $function$;

CREATE OR REPLACE FUNCTION public.list_procedure_sales(p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, sale_number integer, procedure_name text, procedure_fee_paise bigint, items_total_paise bigint, total_paise bigint, discount_paise bigint, payment_mode text, ip_ticket_id uuid, created_at timestamp with time zone, patient_name text, patient_uhid text, doctor_name text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_query text;
begin
  if public.current_app_role() not in ('admin','pharmacy') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  v_query := nullif(trim(coalesce(p_query,'')),'');
  return query
  select
    s.id, s.sale_number, s.procedure_name, s.procedure_fee_paise, s.items_total_paise,
    s.total_paise, s.discount_paise, s.payment_mode::text, s.ip_ticket_id, s.created_at,
    pt.name, pt.uhid, d.display_name,
    count(*) over()
  from public.procedure_sales s
  left join public.patients pt on pt.id = s.patient_id
  left join public.doctors d on d.id = s.doctor_id
  where v_query is null
     or pt.name ilike '%'||v_query||'%'
     or pt.phone_normalized like '%'||regexp_replace(v_query,'\D','','g')||'%'
     or s.procedure_name ilike '%'||v_query||'%'
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit,50),1),200)
  offset greatest(p_offset, 0);
end $function$;

CREATE OR REPLACE FUNCTION public.get_ip_inventory_request_receipt(p_request_id uuid)
 RETURNS TABLE(request_id uuid, created_at timestamp with time zone, fulfilled_at timestamp with time zone, ticket_number text, patient_name text, patient_uhid text, total_paise bigint, collected_paise bigint, discount_paise bigint, settlement text, payment_mode text, payment_reference text, fulfilled_by text, items jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if public.current_app_role() is null
     or public.current_app_role()
        not in ('admin', 'reception', 'ip', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    request.created_at,
    request.fulfilled_at,
    ticket.ticket_number,
    coalesce(patient.name, 'Unidentified emergency')::text,
    patient.uhid,
    lines.total_paise,
    case
      when request.settlement = 'pharmacy_counter'
        then coalesce(request.counter_collected_paise, 0)
          - request.counter_discount_paise
      else coalesce(payment.amount_paise, 0)
    end::bigint,
    request.counter_discount_paise,
    request.settlement::text,
    case
      when request.settlement = 'pharmacy_counter'
        then request.counter_payment_mode::text
      else payment.mode::text
    end,
    case
      when request.settlement = 'pharmacy_counter'
        then request.counter_reference
      else payment.reference
    end,
    profile.full_name,
    lines.items
  from public.ip_inventory_requests request
  join public.ip_tickets ticket on ticket.id = request.ip_ticket_id
  left join public.patients patient on patient.id = ticket.patient_id
  left join public.ip_payments payment on payment.id = request.payment_id
  left join public.profiles profile on profile.id = request.fulfilled_by
  cross join lateral (
    select
      coalesce(sum(item.amount_paise), 0)::bigint as total_paise,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'name', item.requested_name,
          'requested_quantity', item.requested_quantity,
          'supplied_quantity', item.fulfilled_quantity,
          'not_supplied_quantity', greatest(
            0, item.requested_quantity - item.fulfilled_quantity
          ),
          'unit_price_paise', item.unit_price_paise,
          'amount_paise', item.amount_paise,
          'outcome', case
            when item.status = 'unavailable' then 'Unavailable — outside purchase'
            when item.fulfilled_quantity < item.requested_quantity
              then 'Partially supplied'
            else 'Supplied'
          end,
          'source', case
            when item.status = 'unavailable' then 'Not supplied'
            when item.medicine_id is not null then 'Medicine'
            when item.inventory_item_id is not null then 'Inventory'
            else 'Manual'
          end
        ) order by item.created_at, item.id
      ), '[]'::jsonb) as items
    from public.ip_inventory_request_items item
    where item.request_id = request.id
  ) lines
  where request.id = p_request_id
    and request.status = 'fulfilled';
end
$function$;

CREATE OR REPLACE FUNCTION public.list_ip_inventory_requests(p_view text DEFAULT 'pending'::text, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(request_id uuid, ip_ticket_id uuid, ticket_number text, patient_name text, item_count bigint, notes text, status text, settlement text, created_at timestamp with time zone, fulfilled_at timestamp with time zone, total_paise bigint, collected_paise bigint, shortfall_count bigint, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_query text;
  v_view text;
begin
  if public.current_app_role() not in ('admin', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_query := nullif(trim(coalesce(p_query, '')), '');
  v_view := case when p_view = 'completed' then 'completed' else 'pending' end;

  return query
  with requests as (
    select
      request.id as request_id,
      request.ip_ticket_id,
      ticket.ticket_number,
      coalesce(patient.name, 'Unidentified emergency')::text as patient_name,
      count(item.id)::bigint as item_count,
      request.notes,
      request.status::text,
      request.settlement::text,
      request.created_at,
      request.fulfilled_at,
      coalesce(sum(item.amount_paise) filter (
        where item.status = 'fulfilled'
      ), 0)::bigint as total_paise,
      case
        when request.settlement = 'pharmacy_counter'
          then coalesce(request.counter_collected_paise, 0)
            - request.counter_discount_paise
        else coalesce(payment.amount_paise, 0)
      end::bigint as collected_paise,
      count(item.id) filter (
        where item.requested_quantity > item.fulfilled_quantity
      )::bigint as shortfall_count
    from public.ip_inventory_requests request
    join public.ip_tickets ticket on ticket.id = request.ip_ticket_id
    left join public.patients patient on patient.id = ticket.patient_id
    join public.ip_inventory_request_items item
      on item.request_id = request.id
    left join public.ip_payments payment on payment.id = request.payment_id
    where (
      (v_view = 'pending' and (
        request.status = 'pending'
        or (
          request.status = 'fulfilled'
          and request.fulfilled_at > now() - interval '10 minutes'
        )
      ))
      or (
        v_view = 'completed'
        and request.status = 'fulfilled'
        and request.fulfilled_at <= now() - interval '10 minutes'
      )
    )
      and (
        v_query is null
        or ticket.ticket_number ilike '%' || v_query || '%'
        or patient.name ilike '%' || v_query || '%'
      )
    group by
      request.id, request.ip_ticket_id, ticket.ticket_number, patient.name,
      request.notes, request.status, request.settlement, request.created_at,
      request.fulfilled_at, request.counter_collected_paise, request.counter_discount_paise,
      payment.amount_paise
  )
  select
    requests.request_id, requests.ip_ticket_id, requests.ticket_number,
    requests.patient_name, requests.item_count, requests.notes,
    requests.status, requests.settlement, requests.created_at,
    requests.fulfilled_at, requests.total_paise, requests.collected_paise,
    requests.shortfall_count, count(*) over () as total_count
  from requests
  order by
    case when requests.status = 'pending' then 0 else 1 end,
    coalesce(requests.fulfilled_at, requests.created_at) desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset least(greatest(coalesce(p_offset, 0), 0), 100000);
end
$function$;


-- Dashboards and analytics: collected is net cash; discounts reported
CREATE OR REPLACE FUNCTION public.dashboard_summary_internal()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with d as (select (now() at time zone 'Asia/Kolkata')::date today),r as (select public.current_app_role() role,public.current_doctor_id() doctor_id),
s as (select jsonb_build_object(
 'patients_today',(select count(*) from public.patients,d where (created_at at time zone 'Asia/Kolkata')::date=d.today),
 'patients_seen_today',(select count(distinct v.patient_id) from public.visits v,d,r where v.visit_date=d.today and (r.role<>'doctor' or v.doctor_id=r.doctor_id)),
 'visits_today',(select count(*) from public.visits v,d,r where v.visit_date=d.today and (r.role<>'doctor' or v.doctor_id=r.doctor_id)),
 'waiting',(select count(*) from public.visits v,d,r where v.visit_date=d.today and v.status in ('waiting','vitals_pending') and (r.role<>'doctor' or v.doctor_id=r.doctor_id)),
 'ready',(select count(*) from public.visits v,d,r where v.visit_date=d.today and v.status='ready' and (r.role<>'doctor' or v.doctor_id=r.doctor_id)),
 'completed',(select count(*) from public.visits v,d,r where v.visit_date=d.today and v.status='completed' and (r.role<>'doctor' or v.doctor_id=r.doctor_id)),
 'vitals_pending',(select count(*) from public.visits,d where visit_date=d.today and status in ('waiting','vitals_pending')),
 'current_ip',(select count(*) from public.ip_tickets i,r where i.status in ('admitted','discharge_pending') and (r.role<>'doctor' or i.doctor_id=r.doctor_id)),
 'admissions_today',(select count(*) from public.ip_tickets,d where (admission_at at time zone 'Asia/Kolkata')::date=d.today),
 'discharges_today',(select count(*) from public.ip_tickets,d where discharge_at is not null and (discharge_at at time zone 'Asia/Kolkata')::date=d.today),
 'discharge_pending',(select count(*) from public.ip_tickets where status='discharge_pending'),
 'reports_ready',(select count(*) from public.patient_reports where status='ready'),
 'reports_pending',(select count(*) from public.test_orders where status in ('ordered','report_pending')),
 'followups_due',(select count(*) from public.consultations,d where follow_up_type<>'none' and status='completed' and (follow_up_date is null or follow_up_date<=d.today)),
 'pending_prescriptions',(select count(*) from public.prescriptions where status in ('pending','partially_dispensed')),
 'low_stock',(select count(*) from public.medicine_batches where active and quantity between 1 and low_stock_threshold),
 'out_of_stock',(select count(*) from public.medicine_batches where active and quantity=0),
 'expiring_soon',(select count(*) from public.medicine_batches where active and quantity>0 and expiry_date between current_date and current_date+30),
 'dispensed_today',(select count(*) from public.pharmacy_sales,d where (created_at at time zone 'Asia/Kolkata')::date=d.today),
 'op_collection_paise',(select coalesce(sum(amount_paise),0) from public.visit_payments,d where (created_at at time zone 'Asia/Kolkata')::date=d.today),
 'ip_collection_paise',(select coalesce(sum(amount_paise),0) from public.ip_payments,d where (created_at at time zone 'Asia/Kolkata')::date=d.today),
 'pharmacy_sales_today_paise',(select coalesce(sum(total_paise),0) from public.pharmacy_sales,d where (created_at at time zone 'Asia/Kolkata')::date=d.today),
 'ip_balance_paise',(select greatest(0,coalesce((select sum(amount_paise) from public.ip_charges),0)-coalesce((select sum(amount_paise) from public.ip_payments),0)-coalesce((select sum(discount_paise) from public.ip_tickets),0))),
 'collected_today_paise',(select coalesce((select sum(amount_paise) from public.visit_payments,d where (created_at at time zone 'Asia/Kolkata')::date=d.today),0)+coalesce((select sum(amount_paise) from public.ip_payments,d where (created_at at time zone 'Asia/Kolkata')::date=d.today),0)+coalesce((select sum(total_paise-discount_paise) from public.pharmacy_sales,d where source='op' and (created_at at time zone 'Asia/Kolkata')::date=d.today),0))
,
 'discount_today_paise',(select coalesce(sum(amount_paise),0) from public.discounts,d where voided_at is null and (created_at at time zone 'Asia/Kolkata')::date=d.today)
 ) as payload from r)
select case (select role from r)
 when 'admin' then payload
 when 'reception' then payload-array['ip_collection_paise','pharmacy_sales_today_paise','ip_balance_paise','discount_today_paise']
 when 'ip' then payload-array['op_collection_paise','pharmacy_sales_today_paise','collected_today_paise','discount_today_paise']
 when 'pharmacy' then payload-array['op_collection_paise','ip_collection_paise','ip_balance_paise','collected_today_paise','discount_today_paise']
 else payload-array['op_collection_paise','ip_collection_paise','pharmacy_sales_today_paise','ip_balance_paise','collected_today_paise','discount_today_paise'] end from s
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_summary jsonb;
  v_ip_item_value bigint;
  v_ip_item_dispenses bigint;
  v_counter_collected bigint := 0;
begin
  if public.current_app_role() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_summary := public.dashboard_summary_internal();

  if v_summary ? 'pharmacy_sales_today_paise'
     or v_summary ? 'dispensed_today'
  then
    select
      coalesce(sum(
        case when item.status = 'fulfilled' then item.amount_paise else 0 end
      ), 0)::bigint,
      count(distinct request.id) filter (
        where item.status = 'fulfilled' and item.fulfilled_quantity > 0
      )::bigint
    into v_ip_item_value, v_ip_item_dispenses
    from public.ip_inventory_requests request
    left join public.ip_inventory_request_items item
      on item.request_id = request.id
    where request.fulfilled_at is not null
      and (request.fulfilled_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date;
  end if;

  if v_summary ? 'pharmacy_sales_today_paise' then
    v_summary := jsonb_set(
      v_summary,
      '{pharmacy_sales_today_paise}',
      to_jsonb(
        coalesce((v_summary ->> 'pharmacy_sales_today_paise')::bigint, 0)
        + coalesce(v_ip_item_value, 0)
      )
    );
  end if;

  if v_summary ? 'dispensed_today' then
    v_summary := jsonb_set(
      v_summary,
      '{dispensed_today}',
      to_jsonb(
        coalesce((v_summary ->> 'dispensed_today')::bigint, 0)
        + coalesce(v_ip_item_dispenses, 0)
      )
    );
  end if;

  if v_summary ? 'collected_today_paise' then
    -- Counter bills are recorded gross; the cash taken is net of discount.
    -- Procedure bills settled at the counter (not billed to an IP ticket)
    -- are pharmacy-desk collections too.
    select coalesce(sum(collection.amount_paise), 0)::bigint
    into v_counter_collected
    from (
      select request.counter_collected_paise - request.counter_discount_paise
        as amount_paise
      from public.ip_inventory_requests request
      where request.settlement = 'pharmacy_counter'
        and (request.counter_collected_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
      union all
      select sale.total_paise - sale.discount_paise
      from public.procedure_sales sale
      where sale.ip_ticket_id is null
        and (sale.created_at at time zone 'Asia/Kolkata')::date =
            (now() at time zone 'Asia/Kolkata')::date
    ) collection;
    v_summary := jsonb_set(
      v_summary,
      '{collected_today_paise}',
      to_jsonb(
        coalesce((v_summary ->> 'collected_today_paise')::bigint, 0)
        + v_counter_collected
      )
    );
  end if;

  return v_summary;
end
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_metric_detail_for_role(p_metric text, p_limit integer DEFAULT 25)
 RETURNS TABLE(primary_text text, secondary_text text, trailing_text text, href text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role;
  v_limit integer;
begin
  v_role := public.current_app_role();
  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);

  if p_metric = 'collected_today_paise' then
    if v_role is null or v_role not in ('admin', 'reception') then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    return query
    with activity as (
      select
        payment.created_at as sort_at,
        patient.name::text as primary_text,
        (
          'OP visit · ' || replace(payment.mode::text, '_', ' ')
        )::text as secondary_text,
        to_char(payment.amount_paise / 100.0, 'FM999999990.00')::text
          as trailing_text,
        ('/visits/' || visit.id)::text as href
      from public.visit_payments payment
      join public.visits visit on visit.id = payment.visit_id
      join public.patients patient on patient.id = visit.patient_id
      where (payment.created_at at time zone 'Asia/Kolkata')::date =
        (now() at time zone 'Asia/Kolkata')::date

      union all

      select
        payment.created_at,
        coalesce(patient.name, 'Unidentified emergency')::text,
        (
          'IP payment · ' || ticket.ticket_number || ' · '
          || replace(payment.mode::text, '_', ' ')
        )::text,
        to_char(payment.amount_paise / 100.0, 'FM999999990.00')::text,
        ('/ip/' || ticket.id)::text
      from public.ip_payments payment
      join public.ip_tickets ticket on ticket.id = payment.ip_ticket_id
      left join public.patients patient on patient.id = ticket.patient_id
      where (payment.created_at at time zone 'Asia/Kolkata')::date =
        (now() at time zone 'Asia/Kolkata')::date

      union all

      select
        sale.created_at,
        coalesce(patient.name, 'Unknown patient')::text,
        (
          'Pharmacy · ' || replace(sale.payment_mode::text, '_', ' ')
        )::text,
        to_char((sale.total_paise - sale.discount_paise) / 100.0, 'FM999999990.00')::text,
        ('/print/receipt/' || sale.id)::text
      from public.pharmacy_sales sale
      left join public.patients patient on patient.id = sale.patient_id
      where sale.source = 'op'
        and (sale.created_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date

      union all

      select
        request.counter_collected_at,
        coalesce(patient.name, 'Unidentified emergency')::text,
        (
          'Pharmacy counter · ' ||
          replace(request.counter_payment_mode::text, '_', ' ')
        )::text,
        to_char((request.counter_collected_paise - request.counter_discount_paise) / 100.0, 'FM999999990.00')::text,
        ('/print/ip-items/' || request.id)::text
      from public.ip_inventory_requests request
      join public.ip_tickets ticket on ticket.id = request.ip_ticket_id
      left join public.patients patient on patient.id = ticket.patient_id
      where request.settlement = 'pharmacy_counter'
        and (request.counter_collected_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date

      union all

      select
        sale.created_at,
        coalesce(patient.name, 'Unknown patient')::text,
        (
          'Procedure · ' || sale.procedure_name || ' · ' ||
          replace(coalesce(sale.payment_mode::text, 'other'), '_', ' ')
        )::text,
        to_char((sale.total_paise - sale.discount_paise) / 100.0, 'FM999999990.00')::text,
        ('/print/procedure-bill/' || sale.id)::text
      from public.procedure_sales sale
      left join public.patients patient on patient.id = sale.patient_id
      where sale.ip_ticket_id is null
        and (sale.created_at at time zone 'Asia/Kolkata')::date =
          (now() at time zone 'Asia/Kolkata')::date
    )
    select
      activity.primary_text,
      activity.secondary_text,
      activity.trailing_text,
      activity.href
    from activity
    order by activity.sort_at desc
    limit v_limit;
    return;
  end if;

  -- Today's discounts, newest first: what was waived, on which bill, by whom.
  if p_metric = 'discount_today_paise' then
    if v_role is distinct from 'admin' then
      raise exception 'forbidden' using errcode = '42501';
    end if;

    return query
    select
      coalesce(patient.name, 'Unidentified emergency')::text,
      (
        case discount.source
          when 'op_fee' then 'OP visit fee'
          when 'pharmacy_sale' then 'Pharmacy sale'
          when 'ip_ticket' then 'IP bill'
          when 'ip_counter' then 'IP items (counter)'
          else 'Procedure bill'
        end
        || ' · ' || replace(discount.reason::text, '_', ' ')
        || ' · ' || coalesce(giver.full_name, 'Staff')
      )::text,
      to_char(discount.amount_paise / 100.0, 'FM999999990.00')::text,
      '/admin/discounts'::text
    from public.discounts discount
    left join public.patients patient on patient.id = discount.patient_id
    left join public.profiles giver on giver.id = discount.given_by
    where discount.voided_at is null
      and (discount.created_at at time zone 'Asia/Kolkata')::date =
        (now() at time zone 'Asia/Kolkata')::date
    order by discount.created_at desc
    limit v_limit;
    return;
  end if;

  if v_role = 'reception'
     and p_metric = any(array[
       'patients_seen_today', 'vitals_pending', 'ready', 'completed',
       'reports_pending'
     ])
  then
    return query
    select detail.primary_text, detail.secondary_text, detail.trailing_text,
           detail.href
    from public.dashboard_metric_detail(
      p_metric,
      v_limit
    ) detail;
    return;
  end if;

  return query
  select detail.primary_text, detail.secondary_text, detail.trailing_text,
         detail.href
  from public.dashboard_metric_detail_for_role_before_reception_op_merge(
    p_metric,
    p_limit
  ) detail;
end
$function$;

CREATE OR REPLACE FUNCTION public.report_admin_overview(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_from timestamptz;
  v_to timestamptz;
begin
  if public.current_app_role() <> 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Kolkata';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';

  select jsonb_build_object(
    'total_visits', (
      select count(*) from public.visits
      where visit_date between p_from and p_to
    ),
    'unique_patients', (
      select count(distinct patient_id) from public.visits
      where visit_date between p_from and p_to
    ),
    'new_patients', (
      select count(*) from public.patients
      where created_at >= v_from and created_at < v_to
    ),
    'op_collected_paise', (
      select coalesce(sum(payment.amount_paise), 0)
      from public.visit_payments payment
      join public.visits visit on visit.id = payment.visit_id
      where visit.visit_date between p_from and p_to
    ),
    'ip_collected_paise', (
      select coalesce(sum(amount_paise), 0)
      from public.ip_payments
      where created_at >= v_from and created_at < v_to
    ),
    'pharmacy_collected_paise', (
      select coalesce(sum(collection.amount_paise), 0)
      from (
        select sale.total_paise - sale.discount_paise as amount_paise
        from public.pharmacy_sales sale
        where sale.source = 'op'
          and sale.created_at >= v_from and sale.created_at < v_to
        union all
        select request.counter_collected_paise - request.counter_discount_paise
        from public.ip_inventory_requests request
        where request.settlement = 'pharmacy_counter'
          and request.counter_collected_at >= v_from
          and request.counter_collected_at < v_to
        union all
        select sale.total_paise - sale.discount_paise
        from public.procedure_sales sale
        where sale.ip_ticket_id is null
          and sale.created_at >= v_from and sale.created_at < v_to
      ) collection
    ),
    'outstanding_paise', (
      select greatest(
        0,
        coalesce((
          select sum(fee_paise - discount_paise) from public.visits
          where visit_date between p_from and p_to
        ), 0)
        - coalesce((
          select sum(payment.amount_paise)
          from public.visit_payments payment
          join public.visits visit on visit.id = payment.visit_id
          where visit.visit_date between p_from and p_to
        ), 0)
        + coalesce((
          select sum(amount_paise) from public.ip_charges
          where created_at < v_to
        ), 0)
        - coalesce((
          select sum(amount_paise) from public.ip_payments
          where created_at < v_to
        ), 0)
        - coalesce((
          select sum(amount_paise) from public.discounts
          where ip_ticket_id is not null and voided_at is null
            and created_at < v_to
        ), 0)
      )
    ),
    'current_ip', (
      select count(*) from public.ip_tickets
      where status in ('admitted', 'discharge_pending')
    ),
    'visits_by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object('date', metric_date, 'visits', visits)
        order by metric_date
      ), '[]'::jsonb)
      from (
        select visit_date as metric_date, count(*) as visits
        from public.visits
        where visit_date between p_from and p_to
        group by visit_date
      ) data
    ),
    'collections_by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', day.metric_date, 'op', coalesce(op.amount, 0),
          'ip', coalesce(ip.amount, 0),
          'pharmacy', coalesce(pharmacy.amount, 0)
        ) order by day.metric_date
      ), '[]'::jsonb)
      from (
        select generate_series(p_from, p_to, '1 day')::date as metric_date
      ) day
      left join (
        select visit.visit_date as metric_date, sum(payment.amount_paise) as amount
        from public.visit_payments payment
        join public.visits visit on visit.id = payment.visit_id
        where visit.visit_date between p_from and p_to
        group by visit.visit_date
      ) op on op.metric_date = day.metric_date
      left join (
        select (payment.created_at at time zone 'Asia/Kolkata')::date as metric_date,
          sum(payment.amount_paise) as amount
        from public.ip_payments payment
        where payment.created_at >= v_from and payment.created_at < v_to
        group by 1
      ) ip on ip.metric_date = day.metric_date
      left join (
        select collection.metric_date, sum(collection.amount_paise) as amount
        from (
          select (sale.created_at at time zone 'Asia/Kolkata')::date as metric_date,
            sale.total_paise - sale.discount_paise as amount_paise
          from public.pharmacy_sales sale
          where sale.source = 'op'
            and sale.created_at >= v_from and sale.created_at < v_to
          union all
          select (request.counter_collected_at at time zone 'Asia/Kolkata')::date,
            request.counter_collected_paise - request.counter_discount_paise
          from public.ip_inventory_requests request
          where request.settlement = 'pharmacy_counter'
            and request.counter_collected_at >= v_from
            and request.counter_collected_at < v_to
          union all
          select (sale.created_at at time zone 'Asia/Kolkata')::date,
            sale.total_paise - sale.discount_paise
          from public.procedure_sales sale
          where sale.ip_ticket_id is null
            and sale.created_at >= v_from and sale.created_at < v_to
        ) collection
        group by collection.metric_date
      ) pharmacy on pharmacy.metric_date = day.metric_date
    ),
    'visits_by_doctor', (
      select coalesce(jsonb_agg(
        jsonb_build_object('doctor', display_name, 'visits', visits)
        order by visits desc
      ), '[]'::jsonb)
      from (
        select doctor.display_name, count(*) visits
        from public.visits visit
        join public.doctors doctor on doctor.id = visit.doctor_id
        where visit.visit_date between p_from and p_to
        group by doctor.id, doctor.display_name
        order by visits desc
        limit 15
      ) data
    ),
    'ip_by_category', (
      select coalesce(jsonb_agg(
        jsonb_build_object('category', category, 'amount_paise', amount)
        order by amount desc
      ), '[]'::jsonb)
      from (
        select category, sum(amount_paise) amount
        from public.ip_charges
        where created_at >= v_from and created_at < v_to
        group by category
      ) data
    ),
    'top_medicines', (
      select coalesce(jsonb_agg(
        jsonb_build_object('medicine', medicine_name, 'quantity', quantity)
        order by quantity desc
      ), '[]'::jsonb)
      from (
        select prescription_item.medicine_name, sum(sale_item.quantity) quantity
        from public.pharmacy_sale_items sale_item
        join public.prescription_items prescription_item
          on prescription_item.id = sale_item.prescription_item_id
        join public.pharmacy_sales sale on sale.id = sale_item.sale_id
        where sale.created_at >= v_from and sale.created_at < v_to
        group by prescription_item.medicine_name
        order by quantity desc
        limit 10
      ) data
    ),
    'visits_by_hour', (
      select coalesce(jsonb_agg(
        jsonb_build_object('hour', hour.hour, 'visits', coalesce(visits.visits, 0))
        order by hour.hour
      ), '[]'::jsonb)
      from generate_series(0, 23) as hour(hour)
      left join (
        select extract(hour from created_at at time zone 'Asia/Kolkata')::int as hour,
          count(*) visits
        from public.visits
        where visit_date between p_from and p_to
        group by 1
      ) visits on visits.hour = hour.hour
    ),
    'visits_by_status', (
      select coalesce(jsonb_agg(
        jsonb_build_object('status', status, 'visits', visits)
        order by visits desc
      ), '[]'::jsonb)
      from (
        select status::text as status, count(*) visits
        from public.visits
        where visit_date between p_from and p_to
        group by status
      ) data
    ),
    'doctor_visit_mix', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'doctor', display_name, 'op', op, 'follow_up', follow_up
        ) order by op + follow_up desc
      ), '[]'::jsonb)
      from (
        select doctor.display_name,
          count(*) filter (where visit.visit_type = 'op') op,
          count(*) filter (where visit.visit_type = 'follow_up') follow_up
        from public.visits visit
        join public.doctors doctor on doctor.id = visit.doctor_id
        where visit.visit_date between p_from and p_to
        group by doctor.id, doctor.display_name
        order by count(*) desc
        limit 12
      ) data
    ),
    'ip_flow_by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', day.metric_date,
          'admissions', coalesce(admissions.total, 0),
          'discharges', coalesce(discharges.total, 0)
        ) order by day.metric_date
      ), '[]'::jsonb)
      from (
        select generate_series(p_from, p_to, '1 day')::date as metric_date
      ) day
      left join (
        select (admission_at at time zone 'Asia/Kolkata')::date as metric_date,
          count(*) total
        from public.ip_tickets
        where admission_at >= v_from and admission_at < v_to
        group by 1
      ) admissions on admissions.metric_date = day.metric_date
      left join (
        select (discharge_at at time zone 'Asia/Kolkata')::date as metric_date,
          count(*) total
        from public.ip_tickets
        where discharge_at >= v_from and discharge_at < v_to
        group by 1
      ) discharges on discharges.metric_date = day.metric_date
    ),
    'pharmacy_sales_by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', day.metric_date,
          'amount_paise', coalesce(sales.amount, 0),
          'items', coalesce(sales.items, 0)
        ) order by day.metric_date
      ), '[]'::jsonb)
      from (
        select generate_series(p_from, p_to, '1 day')::date as metric_date
      ) day
      left join (
        select ledger.metric_date,
          sum(ledger.amount_paise) as amount,
          sum(ledger.item_quantity) as items
        from (
          select
            (sale.created_at at time zone 'Asia/Kolkata')::date as metric_date,
            sale.total_paise as amount_paise,
            coalesce(sum(sale_item.quantity), 0)::bigint as item_quantity
          from public.pharmacy_sales sale
          left join public.pharmacy_sale_items sale_item
            on sale_item.sale_id = sale.id
          where sale.created_at >= v_from and sale.created_at < v_to
          group by sale.id, sale.created_at, sale.total_paise

          union all

          select
            (request.fulfilled_at at time zone 'Asia/Kolkata')::date,
            coalesce(sum(request_item.amount_paise), 0)::bigint,
            coalesce(sum(request_item.fulfilled_quantity), 0)::bigint
          from public.ip_inventory_requests request
          join public.ip_inventory_request_items request_item
            on request_item.request_id = request.id
          where request.fulfilled_at >= v_from and request.fulfilled_at < v_to
            and request_item.status = 'fulfilled'
          group by request.id, request.fulfilled_at
        ) ledger
        group by ledger.metric_date
      ) sales on sales.metric_date = day.metric_date
    ),
    'collections_by_mode', (
      select coalesce(jsonb_agg(
        jsonb_build_object('mode', mode, 'amount_paise', amount)
        order by amount desc
      ), '[]'::jsonb)
      from (
        select mode::text as mode, sum(amount) amount
        from (
          select payment.mode, payment.amount_paise amount
          from public.visit_payments payment
          join public.visits visit on visit.id = payment.visit_id
          where visit.visit_date between p_from and p_to
          union all
          select payment.mode, payment.amount_paise
          from public.ip_payments payment
          where payment.created_at >= v_from and payment.created_at < v_to
          union all
          select sale.payment_mode, sale.total_paise - sale.discount_paise
          from public.pharmacy_sales sale
          where sale.source = 'op' and sale.payment_mode is not null
            and sale.created_at >= v_from and sale.created_at < v_to
          union all
          select request.counter_payment_mode,
            request.counter_collected_paise - request.counter_discount_paise
          from public.ip_inventory_requests request
          where request.settlement = 'pharmacy_counter'
            and request.counter_payment_mode is not null
            and request.counter_collected_at >= v_from
            and request.counter_collected_at < v_to
          union all
          select sale.payment_mode, sale.total_paise - sale.discount_paise
          from public.procedure_sales sale
          where sale.ip_ticket_id is null and sale.payment_mode is not null
            and sale.created_at >= v_from and sale.created_at < v_to
        ) collection(mode, amount)
        -- A fully discounted bill took no money in any mode.
        where amount > 0
        group by mode
      ) data
    ),
    'source_balance', (
      select jsonb_build_array(
        jsonb_build_object(
          'source', 'OP',
          'collected_paise', (
            select coalesce(sum(payment.amount_paise), 0)
            from public.visit_payments payment
            join public.visits visit on visit.id = payment.visit_id
            where visit.visit_date between p_from and p_to
          ),
          'outstanding_paise', greatest(
            0,
            coalesce((
              select sum(fee_paise - discount_paise) from public.visits
              where visit_date between p_from and p_to
            ), 0)
            - coalesce((
              select sum(payment.amount_paise)
              from public.visit_payments payment
              join public.visits visit on visit.id = payment.visit_id
              where visit.visit_date between p_from and p_to
            ), 0)
          )
        ),
        jsonb_build_object(
          'source', 'IP',
          'collected_paise', (
            select coalesce(sum(amount_paise), 0)
            from public.ip_payments
            where created_at >= v_from and created_at < v_to
          ),
          'outstanding_paise', greatest(
            0,
            coalesce((
              select sum(amount_paise) from public.ip_charges
              where created_at >= v_from and created_at < v_to
            ), 0)
            - coalesce((
              select sum(amount_paise) from public.ip_payments
              where created_at >= v_from and created_at < v_to
            ), 0)
            - coalesce((
              select sum(amount_paise) from public.discounts
              where ip_ticket_id is not null and voided_at is null
                and created_at >= v_from and created_at < v_to
            ), 0)
          )
        ),
        jsonb_build_object(
          'source', 'Pharmacy',
          'collected_paise', (
            select coalesce(sum(collection.amount_paise), 0)
            from (
              select sale.total_paise - sale.discount_paise as amount_paise
              from public.pharmacy_sales sale
              where sale.source = 'op'
                and sale.created_at >= v_from and sale.created_at < v_to
              union all
              select request.counter_collected_paise - request.counter_discount_paise
              from public.ip_inventory_requests request
              where request.settlement = 'pharmacy_counter'
                and request.counter_collected_at >= v_from
                and request.counter_collected_at < v_to
              union all
              select sale.total_paise - sale.discount_paise
              from public.procedure_sales sale
              where sale.ip_ticket_id is null
                and sale.created_at >= v_from and sale.created_at < v_to
            ) collection
          ),
          'outstanding_paise', 0
        )
      )
    ),
    'patients_by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', day.metric_date,
          'new_patients', coalesce(patient_counts.new_patients, 0),
          'returning_patients', coalesce(patient_counts.returning_patients, 0)
        ) order by day.metric_date
      ), '[]'::jsonb)
      from (
        select generate_series(p_from, p_to, '1 day')::date as metric_date
      ) day
      left join (
        select visit.visit_date as metric_date,
          count(distinct visit.patient_id) filter (
            where (patient.created_at at time zone 'Asia/Kolkata')::date = visit.visit_date
          ) new_patients,
          count(distinct visit.patient_id) filter (
            where (patient.created_at at time zone 'Asia/Kolkata')::date < visit.visit_date
          ) returning_patients
        from public.visits visit
        join public.patients patient on patient.id = visit.patient_id
        where visit.visit_date between p_from and p_to
        group by visit.visit_date
      ) patient_counts on patient_counts.metric_date = day.metric_date
    )
  ) into v_result;

  -- Discounts: money a bill was reduced by, never money received. Voided
  -- discounts are corrections and are left out of every figure.
  with given as (
    select
      discount.amount_paise,
      discount.gross_paise,
      discount.reason::text as reason,
      discount.given_by,
      (discount.created_at at time zone 'Asia/Kolkata')::date as metric_date,
      case discount.source
        when 'op_fee' then 'op'
        when 'ip_ticket' then 'ip'
        else 'pharmacy'
      end as desk
    from public.discounts discount
    where discount.voided_at is null
      and discount.created_at >= v_from and discount.created_at < v_to
  )
  select v_result || jsonb_build_object(
    'discount_total_paise', (select coalesce(sum(amount_paise), 0) from given),
    'discount_count', (select count(*) from given),
    'discounted_gross_paise', (select coalesce(sum(gross_paise), 0) from given),
    'discounts_by_day', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'date', day.metric_date,
          'op', coalesce(totals.op, 0),
          'ip', coalesce(totals.ip, 0),
          'pharmacy', coalesce(totals.pharmacy, 0)
        ) order by day.metric_date
      ), '[]'::jsonb)
      from (
        select generate_series(p_from, p_to, '1 day')::date as metric_date
      ) day
      left join (
        select metric_date,
          sum(amount_paise) filter (where desk = 'op') as op,
          sum(amount_paise) filter (where desk = 'ip') as ip,
          sum(amount_paise) filter (where desk = 'pharmacy') as pharmacy
        from given
        group by metric_date
      ) totals on totals.metric_date = day.metric_date
    ),
    'discounts_by_source', (
      select coalesce(jsonb_agg(
        jsonb_build_object('source', desk, 'amount_paise', amount, 'count', entries)
        order by amount desc
      ), '[]'::jsonb)
      from (
        select desk, sum(amount_paise) as amount, count(*) as entries
        from given group by desk
      ) data
    ),
    'discounts_by_reason', (
      select coalesce(jsonb_agg(
        jsonb_build_object('reason', reason, 'amount_paise', amount, 'count', entries)
        order by amount desc
      ), '[]'::jsonb)
      from (
        select reason, sum(amount_paise) as amount, count(*) as entries
        from given group by reason
      ) data
    ),
    'discounts_by_staff', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'staff', data.full_name, 'role', data.role,
          'amount_paise', data.amount, 'count', data.entries
        ) order by data.amount desc
      ), '[]'::jsonb)
      from (
        select profile.full_name, profile.role::text as role,
          sum(given.amount_paise) as amount, count(*) as entries
        from given
        join public.profiles profile on profile.id = given.given_by
        group by profile.id, profile.full_name, profile.role
        order by amount desc
        limit 20
      ) data
    )
  ) into v_result
  from (select 1) anchor;

  return v_result;
end
$function$;

CREATE OR REPLACE FUNCTION public.report_staff_activity(p_from date, p_to date)
 RETURNS TABLE(profile_id uuid, full_name text, role text, status text, patients_registered bigint, visits_created bigint, vitals_recorded bigint, consultations_completed bigint, prescriptions_written bigint, tests_ordered bigint, reports_uploaded bigint, op_payments_count bigint, op_payments_paise bigint, ip_admissions bigint, ip_discharges bigint, ip_charges_added bigint, ip_charges_paise bigint, ip_payments_count bigint, ip_payments_paise bigint, progress_notes bigint, dispenses bigint, dispensed_paise bigint, stock_movements bigint, discounts_count bigint, discounts_paise bigint, audited_actions bigint, last_action_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if public.current_app_role() is null
     or public.current_app_role() <> 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Kolkata';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';

  return query
  select
    profile.id,
    profile.full_name,
    profile.role::text,
    profile.status::text,
    (select count(*) from public.patients patient
       where patient.created_by = profile.id
         and patient.created_at >= v_from and patient.created_at < v_to),
    (select count(*) from public.visits visit
       where visit.created_by = profile.id
         and visit.created_at >= v_from and visit.created_at < v_to),
    (select count(*) from public.vitals vital
       where vital.recorded_by = profile.id
         and vital.recorded_at >= v_from and vital.recorded_at < v_to),
    (select count(*) from public.consultations consultation
       where profile.doctor_id is not null
         and consultation.doctor_id = profile.doctor_id
         and consultation.status = 'completed'
         and consultation.completed_at >= v_from
         and consultation.completed_at < v_to),
    (select count(*) from public.prescriptions prescription
       where profile.doctor_id is not null
         and prescription.doctor_id = profile.doctor_id
         and prescription.status <> 'draft'
         and prescription.created_at >= v_from
         and prescription.created_at < v_to),
    (select count(*) from public.test_orders test_order
       where profile.doctor_id is not null
         and test_order.doctor_id = profile.doctor_id
         and test_order.created_at >= v_from and test_order.created_at < v_to),
    (select count(*) from public.patient_reports report
       where report.uploaded_by = profile.id
         and report.created_at >= v_from and report.created_at < v_to),
    (select count(*) from public.visit_payments payment
       where payment.collected_by = profile.id
         and payment.created_at >= v_from and payment.created_at < v_to),
    (select coalesce(sum(payment.amount_paise), 0)::bigint
       from public.visit_payments payment
       where payment.collected_by = profile.id
         and payment.created_at >= v_from and payment.created_at < v_to),
    (select count(*) from public.ip_tickets ticket
       where ticket.created_by = profile.id
         and ticket.created_at >= v_from and ticket.created_at < v_to),
    (select count(*) from public.audit_logs audit
       where audit.actor_user_id = profile.id and audit.action = 'IP_DISCHARGED'
         and audit.created_at >= v_from and audit.created_at < v_to),
    (select count(*) from public.ip_charges charge
       where charge.added_by = profile.id
         and charge.created_at >= v_from and charge.created_at < v_to),
    (select coalesce(sum(charge.amount_paise), 0)::bigint
       from public.ip_charges charge
       where charge.added_by = profile.id
         and charge.created_at >= v_from and charge.created_at < v_to),
    (select count(*) from public.ip_payments payment
       where payment.collected_by = profile.id
         and payment.created_at >= v_from and payment.created_at < v_to),
    (select coalesce(sum(payment.amount_paise), 0)::bigint
       from public.ip_payments payment
       where payment.collected_by = profile.id
         and payment.created_at >= v_from and payment.created_at < v_to),
    (select count(*) from public.ip_progress_notes note
       where profile.doctor_id is not null and note.doctor_id = profile.doctor_id
         and note.created_at >= v_from and note.created_at < v_to),
    (select count(*) from (
       select sale.id
       from public.pharmacy_sales sale
       where sale.dispensed_by = profile.id
         and sale.created_at >= v_from and sale.created_at < v_to
       union all
       select request.id
       from public.ip_inventory_requests request
       where request.fulfilled_by = profile.id
         and request.fulfilled_at >= v_from and request.fulfilled_at < v_to
         and exists (
           select 1
           from public.ip_inventory_request_items request_item
           where request_item.request_id = request.id
             and request_item.status = 'fulfilled'
             and request_item.fulfilled_quantity > 0
         )
    ) dispense),
    (select coalesce(sum(dispense.amount_paise), 0)::bigint from (
       select sale.total_paise as amount_paise
       from public.pharmacy_sales sale
       where sale.dispensed_by = profile.id
         and sale.created_at >= v_from and sale.created_at < v_to
       union all
       select coalesce(sum(request_item.amount_paise), 0)::bigint
       from public.ip_inventory_requests request
       join public.ip_inventory_request_items request_item
         on request_item.request_id = request.id
       where request.fulfilled_by = profile.id
         and request.fulfilled_at >= v_from and request.fulfilled_at < v_to
         and request_item.status = 'fulfilled'
         and request_item.fulfilled_quantity > 0
       group by request.id
    ) dispense),
    (select count(*) from public.stock_movements movement
       where movement.created_by = profile.id
         and movement.created_at >= v_from and movement.created_at < v_to),
    (select count(*) from public.discounts discount
       where discount.given_by = profile.id and discount.voided_at is null
         and discount.created_at >= v_from and discount.created_at < v_to),
    (select coalesce(sum(discount.amount_paise), 0)::bigint
       from public.discounts discount
       where discount.given_by = profile.id and discount.voided_at is null
         and discount.created_at >= v_from and discount.created_at < v_to),
    (select count(*) from public.audit_logs audit
       where audit.actor_user_id = profile.id
         and audit.created_at >= v_from and audit.created_at < v_to),
    (select max(audit.created_at) from public.audit_logs audit
       where audit.actor_user_id = profile.id
         and audit.created_at >= v_from and audit.created_at < v_to)
  from public.profiles profile
  order by profile.role, profile.full_name;
end
$function$;


-- ---------------------------------------------------------------------------
-- Visit payment (+ optional discount) in one transaction
-- ---------------------------------------------------------------------------
-- Replaces the direct visit_payments insert: a payment and the discount that
-- accompanies it must land together or not at all.
create or replace function public.collect_visit_payment(
  p_visit_id uuid,
  p_amount_paise bigint,
  p_mode public.payment_mode,
  p_reference text,
  p_idempotency_key uuid,
  p_discount_paise bigint default 0,
  p_discount_reason text default null,
  p_discount_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
  v_visit public.visits%rowtype;
  v_paid bigint;
  v_outstanding bigint;
  v_reason public.discount_reason;
  v_discount_key uuid;
begin
  if v_role is null or v_role not in ('admin', 'reception', 'pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '23514';
  end if;
  v_discount_key := md5(p_idempotency_key::text || ':visit_discount')::uuid;
  if exists (select 1 from public.visit_payments where idempotency_key = p_idempotency_key)
     or exists (select 1 from public.discounts where idempotency_key = v_discount_key)
  then
    return p_visit_id;
  end if;
  if coalesce(p_amount_paise, 0) < 0 or coalesce(p_discount_paise, 0) < 0
     or coalesce(p_amount_paise, 0) + coalesce(p_discount_paise, 0) <= 0
  then
    raise exception 'invalid payment amount' using errcode = '23514';
  end if;
  if coalesce(p_amount_paise, 0) > 0 and p_mode is null then
    raise exception 'payment mode is required' using errcode = '23514';
  end if;

  select * into v_visit from public.visits where id = p_visit_id for update;
  if not found or v_visit.status = 'cancelled' then
    raise exception 'visit unavailable' using errcode = '23514';
  end if;
  select coalesce(sum(amount_paise), 0) into v_paid
  from public.visit_payments where visit_id = p_visit_id;
  v_outstanding := v_visit.fee_paise - v_visit.discount_paise - v_paid;
  if coalesce(p_amount_paise, 0) + coalesce(p_discount_paise, 0) > v_outstanding then
    raise exception 'payment exceeds outstanding visit balance' using errcode = '23514';
  end if;

  if coalesce(p_discount_paise, 0) > 0 then
    -- The limit is on the visit's whole fee, counting what was already given.
    v_reason := public.discount_assert_allowed(
      v_visit.discount_paise + p_discount_paise, v_visit.fee_paise,
      p_discount_reason, p_discount_note
    );
    perform public.discount_record(
      'visit', p_visit_id, v_visit.patient_id, v_visit.fee_paise,
      p_discount_paise, v_reason, p_discount_note, v_discount_key
    );
  end if;
  if coalesce(p_amount_paise, 0) > 0 then
    insert into public.visit_payments(
      visit_id, amount_paise, mode, reference, idempotency_key
    ) values (
      p_visit_id, p_amount_paise, p_mode,
      nullif(trim(coalesce(p_reference, '')), ''), p_idempotency_key
    );
  end if;
  return p_visit_id;
end
$$;

-- ---------------------------------------------------------------------------
-- IP payment (+ optional discount) in one transaction
-- ---------------------------------------------------------------------------
create or replace function public.add_ip_payment(
  p_ticket_id uuid,
  p_amount_paise bigint,
  p_mode public.payment_mode,
  p_reference text,
  p_idempotency_key uuid,
  p_discount_paise bigint default 0,
  p_discount_reason text default null,
  p_discount_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := public.current_app_role();
  v_ticket public.ip_tickets%rowtype;
  v_total bigint;
  v_paid bigint;
  v_outstanding bigint;
  v_reason public.discount_reason;
  v_discount_key uuid;
begin
  if v_role is null or v_role not in ('admin', 'ip') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '23514';
  end if;
  v_discount_key := md5(p_idempotency_key::text || ':ip_discount')::uuid;
  if exists (select 1 from public.ip_payments where idempotency_key = p_idempotency_key)
     or exists (select 1 from public.discounts where idempotency_key = v_discount_key)
  then
    return p_ticket_id;
  end if;
  if coalesce(p_amount_paise, 0) < 0 or coalesce(p_discount_paise, 0) < 0
     or coalesce(p_amount_paise, 0) + coalesce(p_discount_paise, 0) <= 0
  then
    raise exception 'invalid payment amount' using errcode = '23514';
  end if;
  if coalesce(p_amount_paise, 0) > 0 and p_mode is null then
    raise exception 'payment mode is required' using errcode = '23514';
  end if;

  select * into v_ticket from public.ip_tickets where id = p_ticket_id for update;
  if not found or v_ticket.status not in ('admitted', 'discharge_pending') then
    raise exception 'IP ticket is not active' using errcode = '23514';
  end if;
  select coalesce(sum(amount_paise), 0) into v_total
  from public.ip_charges where ip_ticket_id = p_ticket_id;
  select coalesce(sum(amount_paise), 0) into v_paid
  from public.ip_payments where ip_ticket_id = p_ticket_id;
  v_outstanding := v_total - v_paid - v_ticket.discount_paise;
  if coalesce(p_amount_paise, 0) + coalesce(p_discount_paise, 0) > v_outstanding then
    raise exception 'payment exceeds outstanding balance' using errcode = '23514';
  end if;

  if coalesce(p_discount_paise, 0) > 0 then
    v_reason := public.discount_assert_allowed(
      v_ticket.discount_paise + p_discount_paise, v_total,
      p_discount_reason, p_discount_note
    );
    perform public.discount_record(
      'ip_ticket', p_ticket_id, v_ticket.patient_id, v_total,
      p_discount_paise, v_reason, p_discount_note, v_discount_key
    );
  end if;
  if coalesce(p_amount_paise, 0) > 0 then
    insert into public.ip_payments(
      ip_ticket_id, amount_paise, mode, reference, idempotency_key
    ) values (
      p_ticket_id, p_amount_paise, p_mode,
      nullif(trim(coalesce(p_reference, '')), ''), p_idempotency_key
    );
  end if;
  return p_ticket_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Void (admin correction)
-- ---------------------------------------------------------------------------
create or replace function public.void_discount(p_discount_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discount public.discounts%rowtype;
  v_ticket_status public.ip_status;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'void reason required' using errcode = '23514';
  end if;
  select * into v_discount from public.discounts where id = p_discount_id for update;
  if not found then
    raise exception 'discount not found' using errcode = '23514';
  end if;
  if v_discount.voided_at is not null then
    return p_discount_id;
  end if;
  -- A counter bill was settled in cash at the discounted amount; voiding its
  -- discount would claim money that was never taken.
  if v_discount.source not in ('op_fee', 'ip_ticket') then
    raise exception 'counter discount is final' using errcode = '23514';
  end if;
  if v_discount.source = 'ip_ticket' then
    select status into v_ticket_status
    from public.ip_tickets where id = v_discount.ip_ticket_id for update;
    if v_ticket_status not in ('admitted', 'discharge_pending') then
      raise exception 'bill is closed' using errcode = '23514';
    end if;
  end if;

  update public.discounts
  set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_discount_id;

  insert into public.audit_logs(
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), 'DISCOUNT_VOIDED', 'discount', p_discount_id,
    jsonb_build_object(
      'source', v_discount.source, 'amount_paise', v_discount.amount_paise
    )
  );
  return p_discount_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Discount register (admin)
-- ---------------------------------------------------------------------------
create or replace function public.list_discounts(
  p_from date,
  p_to date,
  p_source text default null,
  p_reason text default null,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid, created_at timestamptz, source text, bill_label text, href text,
  patient_name text, patient_uhid text, patient_phone text,
  gross_paise bigint, amount_paise bigint, reason text, note text,
  given_by_name text, given_by_role text,
  voided_at timestamptz, voided_by_name text, void_reason text,
  can_void boolean, total_count bigint, total_amount_paise bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_digits text;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range';
  end if;
  v_from := p_from::timestamp at time zone 'Asia/Kolkata';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';
  v_digits := regexp_replace(coalesce(v_query, ''), '\D', '', 'g');

  return query
  with matched as (
    select
      discount.*,
      patient.name as p_name, patient.uhid as p_uhid,
      patient.phone_normalized as p_phone,
      giver.full_name as giver_name, giver.role::text as giver_role,
      voider.full_name as voider_name,
      case discount.source
        when 'op_fee' then 'OP visit · token ' || visit.token_number
        when 'pharmacy_sale' then 'Pharmacy sale'
        when 'ip_ticket' then 'IP bill · ' || ticket.ticket_number
        when 'ip_counter' then 'IP items · ' || coalesce(request_ticket.ticket_number, '')
        else 'Procedure #' || procedure.sale_number || ' · ' || procedure.procedure_name
      end as label,
      case discount.source
        when 'op_fee' then '/visits/' || discount.visit_id
        when 'pharmacy_sale' then '/print/receipt/' || discount.pharmacy_sale_id
        when 'ip_ticket' then '/ip/' || discount.ip_ticket_id
        when 'ip_counter' then '/print/ip-items/' || discount.ip_inventory_request_id
        else '/print/procedure-bill/' || discount.procedure_sale_id
      end as link,
      discount.voided_at is null
        and (
          discount.source = 'op_fee'
          or (
            discount.source = 'ip_ticket'
            and ticket.status in ('admitted', 'discharge_pending')
          )
        ) as voidable
    from public.discounts discount
    left join public.patients patient on patient.id = discount.patient_id
    left join public.profiles giver on giver.id = discount.given_by
    left join public.profiles voider on voider.id = discount.voided_by
    left join public.visits visit on visit.id = discount.visit_id
    left join public.ip_tickets ticket on ticket.id = discount.ip_ticket_id
    left join public.ip_inventory_requests request
      on request.id = discount.ip_inventory_request_id
    left join public.ip_tickets request_ticket on request_ticket.id = request.ip_ticket_id
    left join public.procedure_sales procedure on procedure.id = discount.procedure_sale_id
    where discount.created_at >= v_from and discount.created_at < v_to
      and (
        p_source is null
        or (p_source = 'op' and discount.source = 'op_fee')
        or (p_source = 'ip' and discount.source = 'ip_ticket')
        or (p_source = 'pharmacy'
            and discount.source in ('pharmacy_sale', 'ip_counter', 'procedure'))
      )
      and (p_reason is null or discount.reason::text = p_reason)
      and (
        v_query is null
        or patient.name ilike '%' || v_query || '%'
        or giver.full_name ilike '%' || v_query || '%'
        or (v_digits <> '' and patient.phone_normalized like '%' || v_digits || '%')
        or patient.uhid ilike v_query || '%'
      )
  )
  select
    matched.id, matched.created_at, matched.source, matched.label, matched.link,
    matched.p_name, matched.p_uhid, matched.p_phone,
    matched.gross_paise, matched.amount_paise, matched.reason::text, matched.note,
    matched.giver_name, matched.giver_role,
    matched.voided_at, matched.voider_name, matched.void_reason,
    matched.voidable,
    count(*) over ()::bigint,
    (coalesce(sum(matched.amount_paise) filter (where matched.voided_at is null) over (), 0))::bigint
  from matched
  order by matched.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset least(greatest(coalesce(p_offset, 0), 0), 100000);
end
$$;


-- ---------------------------------------------------------------------------
-- Execute grants: callable RPCs for signed-in staff only; helpers and
-- trigger functions for nobody but their owner.
-- ---------------------------------------------------------------------------
revoke all on function public.visit_consultation_balance(uuid) from public, anon;
grant execute on function public.visit_consultation_balance(uuid) to authenticated, service_role;
revoke all on function public.get_visit_financial_summaries(uuid[]) from public, anon;
grant execute on function public.get_visit_financial_summaries(uuid[]) to authenticated, service_role;
revoke all on function public.list_pending_consultation_fees(text,integer,integer) from public, anon;
grant execute on function public.list_pending_consultation_fees(text,integer,integer) to authenticated, service_role;
revoke all on function public.list_pending_prescriptions(text,integer,text,integer) from public, anon;
grant execute on function public.list_pending_prescriptions(text,integer,text,integer) to authenticated, service_role;
revoke all on function public.get_ip_financial_summaries(uuid[]) from public, anon;
grant execute on function public.get_ip_financial_summaries(uuid[]) to authenticated, service_role;
revoke all on function public.complete_ip_discharge(uuid) from public, anon;
grant execute on function public.complete_ip_discharge(uuid) to authenticated, service_role;
revoke all on function public.dispense_prescription(uuid,jsonb,public.payment_mode,uuid,bigint,bigint,text,text) from public, anon;
grant execute on function public.dispense_prescription(uuid,jsonb,public.payment_mode,uuid,bigint,bigint,text,text) to authenticated, service_role;
revoke all on function public.create_procedure_sale(uuid,uuid,uuid,text,bigint,jsonb,public.payment_mode,text,uuid,bigint,text,text) from public, anon;
grant execute on function public.create_procedure_sale(uuid,uuid,uuid,text,bigint,jsonb,public.payment_mode,text,uuid,bigint,text,text) to authenticated, service_role;
revoke all on function public.fulfill_ip_inventory_request(uuid,jsonb,uuid,bigint,public.payment_mode,text,text,bigint,text,text) from public, anon;
grant execute on function public.fulfill_ip_inventory_request(uuid,jsonb,uuid,bigint,public.payment_mode,text,text,bigint,text,text) to authenticated, service_role;
revoke all on function public.get_sale_receipt(uuid) from public, anon;
grant execute on function public.get_sale_receipt(uuid) to authenticated, service_role;
revoke all on function public.list_pharmacy_sales(text,integer,integer) from public, anon;
grant execute on function public.list_pharmacy_sales(text,integer,integer) to authenticated, service_role;
revoke all on function public.get_procedure_bill_receipt(uuid) from public, anon;
grant execute on function public.get_procedure_bill_receipt(uuid) to authenticated, service_role;
revoke all on function public.list_procedure_sales(text,integer,integer) from public, anon;
grant execute on function public.list_procedure_sales(text,integer,integer) to authenticated, service_role;
revoke all on function public.get_ip_inventory_request_receipt(uuid) from public, anon;
grant execute on function public.get_ip_inventory_request_receipt(uuid) to authenticated, service_role;
revoke all on function public.list_ip_inventory_requests(text,text,integer,integer) from public, anon;
grant execute on function public.list_ip_inventory_requests(text,text,integer,integer) to authenticated, service_role;
revoke all on function public.dashboard_summary() from public, anon;
grant execute on function public.dashboard_summary() to authenticated, service_role;
revoke all on function public.dashboard_metric_detail_for_role(text,integer) from public, anon;
grant execute on function public.dashboard_metric_detail_for_role(text,integer) to authenticated, service_role;
revoke all on function public.report_admin_overview(date,date) from public, anon;
grant execute on function public.report_admin_overview(date,date) to authenticated, service_role;
revoke all on function public.report_staff_activity(date,date) from public, anon;
grant execute on function public.report_staff_activity(date,date) to authenticated, service_role;
revoke all on function public.collect_visit_payment(uuid,bigint,public.payment_mode,text,uuid,bigint,text,text) from public, anon;
grant execute on function public.collect_visit_payment(uuid,bigint,public.payment_mode,text,uuid,bigint,text,text) to authenticated, service_role;
revoke all on function public.add_ip_payment(uuid,bigint,public.payment_mode,text,uuid,bigint,text,text) from public, anon;
grant execute on function public.add_ip_payment(uuid,bigint,public.payment_mode,text,uuid,bigint,text,text) to authenticated, service_role;
revoke all on function public.void_discount(uuid,text) from public, anon;
grant execute on function public.void_discount(uuid,text) to authenticated, service_role;
revoke all on function public.list_discounts(date,date,text,text,text,integer,integer) from public, anon;
grant execute on function public.list_discounts(date,date,text,text,text,integer,integer) to authenticated, service_role;
revoke all on function public.discount_limit_percent() from public, anon, authenticated;
revoke all on function public.discount_assert_allowed(bigint,bigint,text,text) from public, anon, authenticated;
revoke all on function public.discount_record(text,uuid,uuid,bigint,bigint,public.discount_reason,text,uuid) from public, anon, authenticated;
revoke all on function public.dashboard_summary_internal() from public, anon, authenticated;
grant execute on function public.dashboard_summary_internal() to service_role;
revoke all on function public.protect_discount_total() from public, anon;
grant execute on function public.protect_discount_total() to authenticated, service_role;
revoke all on function public.protect_discount_row() from public, anon;
grant execute on function public.protect_discount_row() to authenticated, service_role;
revoke all on function public.sync_discount_total() from public, anon;
grant execute on function public.sync_discount_total() to authenticated, service_role;
revoke all on function public.prevent_visit_overpayment() from public, anon;
grant execute on function public.prevent_visit_overpayment() to authenticated, service_role;
revoke all on function public.require_settled_op_fee() from public, anon;
grant execute on function public.require_settled_op_fee() to authenticated, service_role;

commit;
