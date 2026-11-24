begin;

-- Quotation requests remain distinct from interior_projects, which represent work
-- that has been accepted and is in delivery or construction.
create table public.interior_quote_requests (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  contact_name text not null check (length(trim(contact_name)) > 0),
  contact_email text not null check (length(trim(contact_email)) > 0),
  contact_phone text not null check (length(trim(contact_phone)) > 0),
  property_type text not null check (property_type in ('residential', 'commercial', 'office', 'other')),
  total_square_feet numeric(12,2) not null check (total_square_feet > 0),
  floor_count integer not null check (floor_count > 0),
  room_count integer not null check (room_count > 0),
  location jsonb not null default '{}'::jsonb check (jsonb_typeof(location) = 'object'),
  readiness_status text not null check (readiness_status in ('planning', 'under_construction', 'ready', 'occupied', 'renovation')),
  design_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(design_preferences) = 'object'),
  scope_of_work text[] not null check (cardinality(scope_of_work) > 0),
  description text not null check (length(trim(description)) >= 10),
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'site_visit', 'needs_information', 'quoted', 'accepted', 'rejected', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interior_quote_requests_customer_created_idx
  on public.interior_quote_requests (customer_id, created_at desc);
create index interior_quote_requests_status_created_idx
  on public.interior_quote_requests (status, created_at desc);

create table public.interior_quote_request_rooms (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.interior_quote_requests(id) on delete cascade,
  room_type text not null check (room_type in ('living_room', 'master_bedroom', 'guest_bedroom', 'kids_room', 'kitchen', 'washroom', 'dining_room', 'balcony', 'office')),
  quantity integer not null default 1 check (quantity > 0 and quantity <= 30),
  square_feet numeric(12,2) check (square_feet is null or square_feet > 0),
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  notes text,
  is_in_scope boolean not null default true,
  created_at timestamptz not null default now()
);
create index interior_quote_request_rooms_request_idx on public.interior_quote_request_rooms (request_id);

create table public.interior_quote_request_references (
  request_id uuid not null references public.interior_quote_requests(id) on delete cascade,
  reference_id uuid not null references public.interior_references(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (request_id, reference_id)
);
create index interior_quote_request_references_reference_idx
  on public.interior_quote_request_references (reference_id);

create table public.interior_quote_request_media (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.interior_quote_requests(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video', 'document')),
  original_filename text,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now()
);
create index interior_quote_request_media_request_idx on public.interior_quote_request_media (request_id);

-- Reuse the same quotation revisions and line items for both request types.
alter table public.quotations alter column quote_request_id drop not null;
alter table public.quotations
  add column interior_quote_request_id uuid references public.interior_quote_requests(id) on delete restrict,
  add constraint quotations_exactly_one_request_check check (
    num_nonnulls(quote_request_id, interior_quote_request_id) = 1
  );
create index quotations_interior_request_idx
  on public.quotations (interior_quote_request_id)
  where interior_quote_request_id is not null;

alter table public.interior_quote_requests enable row level security;
alter table public.interior_quote_request_rooms enable row level security;
alter table public.interior_quote_request_references enable row level security;
alter table public.interior_quote_request_media enable row level security;

grant select, insert, update, delete on public.interior_quote_requests,
  public.interior_quote_request_rooms, public.interior_quote_request_references,
  public.interior_quote_request_media to authenticated;

create policy interior_quote_requests_staff_manage on public.interior_quote_requests for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_quote_request_rooms_staff_manage on public.interior_quote_request_rooms for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_quote_request_references_staff_manage on public.interior_quote_request_references for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_quote_request_media_staff_manage on public.interior_quote_request_media for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));

create policy interior_quote_requests_select_linked_customer on public.interior_quote_requests for select to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = interior_quote_requests.customer_id and l.user_id = (select auth.uid())));
create policy interior_quote_request_rooms_select_linked_customer on public.interior_quote_request_rooms for select to authenticated
  using (exists (select 1 from public.interior_quote_requests q join public.customer_auth_links l on l.customer_id = q.customer_id where q.id = request_id and l.user_id = (select auth.uid())));
create policy interior_quote_request_references_select_linked_customer on public.interior_quote_request_references for select to authenticated
  using (exists (select 1 from public.interior_quote_requests q join public.customer_auth_links l on l.customer_id = q.customer_id where q.id = request_id and l.user_id = (select auth.uid())));
create policy interior_quote_request_media_select_linked_customer on public.interior_quote_request_media for select to authenticated
  using (exists (select 1 from public.interior_quote_requests q join public.customer_auth_links l on l.customer_id = q.customer_id where q.id = request_id and l.user_id = (select auth.uid())));

create policy quotations_select_linked_interior_customer on public.quotations for select to authenticated
  using (exists (select 1 from public.interior_quote_requests q join public.customer_auth_links l on l.customer_id = q.customer_id where q.id = interior_quote_request_id and l.user_id = (select auth.uid())));
create policy quotation_revisions_select_linked_interior_customer on public.quotation_revisions for select to authenticated
  using (exists (select 1 from public.quotations qt join public.interior_quote_requests q on q.id = qt.interior_quote_request_id join public.customer_auth_links l on l.customer_id = q.customer_id where qt.id = quotation_id and l.user_id = (select auth.uid())));
create policy quotation_items_select_linked_interior_customer on public.quotation_items for select to authenticated
  using (exists (select 1 from public.quotation_revisions r join public.quotations qt on qt.id = r.quotation_id join public.interior_quote_requests q on q.id = qt.interior_quote_request_id join public.customer_auth_links l on l.customer_id = q.customer_id where r.id = revision_id and l.user_id = (select auth.uid())));

commit;
