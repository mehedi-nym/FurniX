begin;

alter table public.quote_request_items
  add column source_product_id uuid references public.products(id) on delete set null;

alter table public.quote_requests
  add column contact_name text,
  add column contact_email text,
  add column contact_phone text,
  add constraint quote_requests_contact_snapshot_check check (
    num_nonnulls(contact_name, contact_email, contact_phone) in (0, 3)
    and (contact_name is null or length(trim(contact_name)) > 0)
    and (contact_email is null or length(trim(contact_email)) > 0)
    and (contact_phone is null or length(trim(contact_phone)) > 0)
  );

create index quote_request_items_source_product_idx
  on public.quote_request_items (source_product_id)
  where source_product_id is not null;

commit;
