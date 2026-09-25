-- Stock search never found items whose stored search text held a double space.
--
-- The search RPCs collapse runs of whitespace in what staff type
-- ("catgut  rb" -> "catgut rb") and then match with LIKE against search_text.
-- The stored side was only lower(trim(...)), so it kept any double space from
-- the name -- common in Excel imports ("0- CATGUT  RB") -- and the medicine
-- expression itself produced one whenever generic name or strength was empty
-- ("brand" || ' ' || '' || ' ' || "form"). Neither could ever match.
--
-- Collapse whitespace on the stored side too, so both sides of the LIKE use
-- the same normal form. regexp_replace is immutable, so it is allowed in a
-- generated column; SET EXPRESSION recomputes existing rows and rebuilds the
-- search_text indexes (inventory_items keeps its uniqueness on the collapsed
-- value -- checked before release: no two items differ only by spacing).

alter table public.inventory_items
  alter column search_text set expression as (
    regexp_replace(lower(trim(name)), '\s+', ' ', 'g')
  );

alter table public.medicine_directory
  alter column search_text set expression as (
    regexp_replace(
      lower(trim(
        brand_name || ' ' || coalesce(generic_name, '') || ' ' ||
        coalesce(strength, '') || ' ' || dosage_form || ' ' ||
        coalesce(manufacturer, '')
      )),
      '\s+', ' ', 'g'
    )
  );
