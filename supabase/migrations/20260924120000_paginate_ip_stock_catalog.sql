-- Add a read-only paginated search for pharmacy fulfilment. No data writes.
-- Keep the existing RPC unchanged for clinical suggestions and initial matching.
begin;

create or replace function public.search_ip_stock_catalog_page(
  p_query text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table(
  stock_type text,
  stock_id uuid,
  name text,
  detail text,
  unit text,
  selling_price_paise bigint,
  pack_price_paise bigint,
  units_per_pack integer,
  quantity bigint,
  price_tiers jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_query text;
begin
  v_role := public.current_app_role();
  if v_role is null
     or v_role not in ('admin','pharmacy') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_query := nullif(
    lower(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g')),
    ''
  );

  return query
  with available as (
    select
      'inventory'::text as stock_type,
      inventory.id as stock_id,
      inventory.name::text as name,
      'Inventory item'::text as detail,
      coalesce(nullif(inventory.unit, ''), 'unit')::text as unit,
      inventory.selling_price_paise::bigint as selling_price_paise,
      null::bigint as pack_price_paise,
      1::integer as units_per_pack,
      case
        when inventory.expiry_date is null
          or inventory.expiry_date >= current_date
        then inventory.quantity
        else 0
      end::bigint as quantity,
      null::jsonb as price_tiers,
      inventory.search_text::text as search_text
    from public.inventory_items inventory
    where inventory.active

    union all

    select
      'medicine'::text,
      medicine.id,
      medicine.brand_name::text,
      concat_ws(
        ' · ', nullif(medicine.generic_name, ''),
        nullif(medicine.strength, ''), nullif(medicine.dosage_form, '')
      )::text,
      coalesce(nullif(medicine.dosage_form, ''), 'unit')::text,
      coalesce(round(
        first_batch.selling_price_paise::numeric
        / greatest(first_batch.units_per_pack, 1)
      ), 0)::bigint,
      first_batch.selling_price_paise::bigint,
      coalesce(first_batch.units_per_pack, 1)::integer,
      coalesce(totals.quantity, 0)::bigint,
      totals.price_tiers,
      medicine.search_text::text
    from public.medicine_directory medicine
    left join lateral (
      select
        coalesce(sum(batch.quantity), 0)::bigint as quantity,
        jsonb_agg(
          jsonb_build_object(
            'quantity', batch.quantity,
            'pack_price_paise', batch.selling_price_paise,
            'units_per_pack', batch.units_per_pack
          ) order by batch.expiry_date, batch.id
        ) filter (where batch.quantity > 0) as price_tiers
      from public.medicine_batches batch
      where batch.medicine_id = medicine.id
        and batch.active
        and batch.quantity > 0
        and batch.expiry_date >= current_date
    ) totals on true
    left join lateral (
      select batch.selling_price_paise, batch.units_per_pack
      from public.medicine_batches batch
      where batch.medicine_id = medicine.id
        and batch.active
        and batch.expiry_date >= current_date
      order by case when batch.quantity > 0 then 0 else 1 end,
        batch.expiry_date, batch.id
      limit 1
    ) first_batch on true
    where medicine.active
  )
  select
    available.stock_type, available.stock_id, available.name,
    available.detail, available.unit, available.selling_price_paise,
    available.pack_price_paise, available.units_per_pack,
    available.quantity, available.price_tiers
  from available
  where v_query is null
     or available.search_text like v_query || '%'
     or available.search_text like '% ' || v_query || '%'
  order by
    case when lower(available.name) = v_query then 0 else 1 end,
    case when available.quantity > 0 then 0 else 1 end,
    available.name,
    available.stock_type,
    available.stock_id
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;

revoke all on function public.search_ip_stock_catalog_page(text, integer, integer) from public, anon;
grant execute on function public.search_ip_stock_catalog_page(text, integer, integer) to authenticated, service_role;

commit;
