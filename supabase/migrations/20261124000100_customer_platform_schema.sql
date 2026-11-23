-- Customer storefront schema. Apply only after reviewing this migration.
-- Privileged checkout, claim, and staff operations belong in trusted server code.

begin;

-- Identity is kept separate from the customer record created during guest checkout.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'admin', 'staff')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null,
  email_normalized text generated always as (lower(trim(email))) stored,
  phone text not null,
  phone_normalized text generated always as (regexp_replace(phone, '[^0-9+]', '', 'g')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contact values are deliberately not unique: a match is not proof of ownership.
create index customers_email_normalized_idx on public.customers (email_normalized);
create index customers_phone_normalized_idx on public.customers (phone_normalized);

create table public.customer_auth_links (
  customer_id uuid not null references public.customers(id) on delete restrict,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  verified_at timestamptz not null,
  verification_method text not null check (verification_method in ('email_otp', 'email_magic_link', 'phone_otp', 'manual_verified')),
  created_at timestamptz not null default now(),
  primary key (customer_id, user_id)
);
create index customer_auth_links_customer_idx on public.customer_auth_links (customer_id);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  label text,
  recipient_name text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  locality text not null,
  district text not null,
  postal_code text,
  delivery_notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_addresses_customer_idx on public.customer_addresses (customer_id);
create unique index customer_addresses_one_default_idx on public.customer_addresses (customer_id) where is_default;

create table public.guest_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  customer_id uuid references public.customers(id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index guest_checkout_sessions_expiry_idx on public.guest_checkout_sessions (expires_at);

-- Catalogue and many-to-many product/category assignment.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);
create index categories_parent_sort_idx on public.categories (parent_id, sort_order);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  sku text not null unique,
  name text not null,
  description text,
  specifications jsonb not null default '{}'::jsonb check (jsonb_typeof(specifications) = 'object'),
  base_price numeric(12,2) not null check (base_price >= 0),
  discount_price numeric(12,2) check (discount_price is null or (discount_price >= 0 and discount_price <= base_price)),
  currency char(3) not null default 'BDT',
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  materials text[] not null default '{}',
  availability_status text not null default 'available' check (availability_status in ('available', 'made_to_order', 'unavailable')),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_featured boolean not null default false,
  is_published boolean not null default false,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_published_featured_idx on public.products (is_featured, created_at desc) where is_published;
create index products_published_name_idx on public.products (name) where is_published;

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);
create index product_categories_category_idx on public.product_categories (category_id, product_id);
create unique index product_categories_one_primary_idx on public.product_categories (product_id) where is_primary;

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_media_product_sort_idx on public.product_media (product_id, sort_order);

create table public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  selection_mode text not null default 'single' check (selection_mode in ('single', 'multiple')),
  is_required boolean not null default false,
  sort_order integer not null default 0,
  unique (id, product_id)
);
create index product_option_groups_product_idx on public.product_option_groups (product_id, sort_order);

create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  label text not null,
  value text not null,
  price_delta numeric(12,2) not null default 0 check (price_delta >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  unique (id, group_id)
);
create index product_options_group_idx on public.product_options (group_id, sort_order) where is_active;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  price_override numeric(12,2) check (price_override is null or price_override >= 0),
  price_delta numeric(12,2) not null default 0 check (price_delta >= 0),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, product_id),
  check (price_override is null or price_delta = 0)
);
create index product_variants_product_idx on public.product_variants (product_id) where is_active;

create table public.variant_option_values (
  variant_id uuid not null,
  product_id uuid not null,
  group_id uuid not null,
  option_id uuid not null,
  primary key (variant_id, group_id),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete cascade,
  foreign key (group_id, product_id) references public.product_option_groups(id, product_id) on delete cascade,
  foreign key (option_id, group_id) references public.product_options(id, group_id) on delete cascade
);
create index variant_option_values_option_idx on public.variant_option_values (option_id);

create table public.product_customization_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  target_type text not null check (target_type in ('dimension', 'option', 'feature')),
  target_key text not null,
  charge_type text check (charge_type in ('fixed', 'per_unit', 'percentage')),
  amount numeric(12,4) check (amount is null or amount >= 0),
  per_unit_basis text check (per_unit_basis in ('dimension_delta', 'quantity', 'selection')),
  percentage_base text check (percentage_base in ('base_price', 'base_plus_options')),
  minimum_value numeric(12,4),
  maximum_value numeric(12,4),
  manual_quote_only boolean not null default false,
  priority integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_value is null or minimum_value >= 0),
  check (maximum_value is null or maximum_value >= 0),
  check (minimum_value is null or maximum_value is null or minimum_value <= maximum_value),
  check (valid_until is null or valid_from is null or valid_until > valid_from),
  check ((manual_quote_only and charge_type is null and amount is null) or
         (not manual_quote_only and charge_type is not null and amount is not null)),
  check ((charge_type = 'per_unit' and per_unit_basis is not null) or charge_type <> 'per_unit' or manual_quote_only),
  check ((charge_type = 'percentage' and percentage_base is not null) or charge_type <> 'percentage' or manual_quote_only)
);
create index product_customization_rules_product_idx on public.product_customization_rules (product_id, priority) where is_active;

-- Cart, checkout, orders, and historical price snapshots.
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete restrict,
  guest_session_id uuid references public.guest_checkout_sessions(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'converted', 'abandoned', 'expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id is not null or guest_session_id is not null)
);
create index carts_customer_status_idx on public.carts (customer_id, status);
create index carts_guest_session_idx on public.carts (guest_session_id);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete set null,
  quantity integer not null check (quantity > 0),
  customization jsonb not null default '{}'::jsonb check (jsonb_typeof(customization) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cart_items_cart_idx on public.cart_items (cart_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'processing', 'ready', 'shipped', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed')),
  currency char(3) not null default 'BDT',
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount_total numeric(12,2) not null default 0 check (discount_total >= 0),
  delivery_total numeric(12,2) not null default 0 check (delivery_total >= 0),
  tax_total numeric(12,2) not null default 0 check (tax_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  delivery_address jsonb not null check (jsonb_typeof(delivery_address) = 'object'),
  delivery_notes text,
  installation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  variant_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(variant_snapshot) = 'object'),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_item_customizations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  customization_snapshot jsonb not null check (jsonb_typeof(customization_snapshot) = 'object'),
  pricing_breakdown_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(pricing_breakdown_snapshot) = 'array'),
  created_at timestamptz not null default now()
);
create index order_item_customizations_item_idx on public.order_item_customizations (order_item_id);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  status text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_source text not null check (actor_source in ('customer', 'staff', 'system', 'payment_provider')),
  customer_note text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_created_idx on public.order_status_history (order_id, created_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  method text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'BDT',
  status text not null check (status in ('pending', 'authorized', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded')),
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_created_idx on public.payments (order_id, created_at desc);

create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  locality text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.shipping_zones(id) on delete restrict,
  name text not null,
  charge numeric(12,2) not null default 0 check (charge >= 0),
  free_over_subtotal numeric(12,2) check (free_over_subtotal is null or free_over_subtotal >= 0),
  estimated_days_min integer check (estimated_days_min is null or estimated_days_min >= 0),
  estimated_days_max integer check (estimated_days_max is null or estimated_days_max >= 0),
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  check (estimated_days_max is null or estimated_days_min is null or estimated_days_max >= estimated_days_min),
  check (valid_until is null or valid_from is null or valid_until > valid_from)
);
create index shipping_methods_zone_idx on public.shipping_methods (zone_id) where is_active;

-- Furniture quotation requests and versioned customer quotations.
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'needs_information', 'quoted', 'accepted', 'rejected', 'closed')),
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quote_requests_customer_created_idx on public.quote_requests (customer_id, created_at desc);
create index quote_requests_status_created_idx on public.quote_requests (status, created_at desc);

create table public.quote_request_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  furniture_type text not null,
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  material_preferences text[] not null default '{}',
  wood_type text,
  color text,
  finishing text,
  quantity integer not null default 1 check (quantity > 0),
  requirements text,
  created_at timestamptz not null default now()
);
create index quote_request_items_request_idx on public.quote_request_items (quote_request_id);

create table public.quote_request_media (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video', 'document')),
  original_filename text,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  created_at timestamptz not null default now()
);
create index quote_request_media_request_idx on public.quote_request_media (quote_request_id);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references public.quote_requests(id) on delete restrict,
  public_reference text not null unique,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'withdrawn')),
  current_revision integer not null default 1 check (current_revision > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotations_request_idx on public.quotations (quote_request_id);

create table public.quotation_revisions (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  total numeric(12,2) not null check (total >= 0),
  currency char(3) not null default 'BDT',
  terms text,
  valid_until timestamptz,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded')),
  customer_response_at timestamptz,
  created_at timestamptz not null default now(),
  unique (quotation_id, revision_number)
);
create index quotation_revisions_quotation_idx on public.quotation_revisions (quotation_id, revision_number desc);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.quotation_revisions(id) on delete restrict,
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index quotation_items_revision_idx on public.quotation_items (revision_id);

-- Interior references are public only when published; project requests remain private.
create table public.interior_reference_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.interior_references (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.interior_reference_categories(id) on delete set null,
  slug text not null unique,
  project_name text not null,
  description text,
  room_type text,
  materials text[] not null default '{}',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interior_references_category_idx on public.interior_references (category_id) where is_published;

create table public.interior_reference_media (
  id uuid primary key default gen_random_uuid(),
  reference_id uuid not null references public.interior_references(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  alt_text text,
  sort_order integer not null default 0
);
create index interior_reference_media_sort_idx on public.interior_reference_media (reference_id, sort_order);

create table public.interior_projects (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  property_type text not null,
  total_square_feet numeric(12,2) check (total_square_feet is null or total_square_feet > 0),
  floor_count integer check (floor_count is null or floor_count > 0),
  room_count integer check (room_count is null or room_count >= 0),
  location jsonb not null default '{}'::jsonb check (jsonb_typeof(location) = 'object'),
  readiness_status text,
  design_preferences jsonb not null default '{}'::jsonb check (jsonb_typeof(design_preferences) = 'object'),
  scope_of_work text[] not null default '{}',
  description text,
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'site_visit', 'needs_information', 'quoted', 'accepted', 'rejected', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index interior_projects_customer_created_idx on public.interior_projects (customer_id, created_at desc);
create index interior_projects_status_created_idx on public.interior_projects (status, created_at desc);

create table public.interior_project_rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.interior_projects(id) on delete cascade,
  room_type text not null,
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  notes text,
  is_in_scope boolean not null default true,
  created_at timestamptz not null default now()
);
create index interior_project_rooms_project_idx on public.interior_project_rooms (project_id);

create table public.interior_project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.interior_projects(id) on delete cascade,
  storage_path text unique,
  reference_id uuid references public.interior_references(id) on delete set null,
  media_type text check (media_type in ('image', 'video', 'reference')),
  original_filename text,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size > 0),
  created_at timestamptz not null default now(),
  check ((storage_path is not null and reference_id is null and media_type in ('image', 'video')) or
         (storage_path is null and reference_id is not null and media_type = 'reference'))
);
create index interior_project_media_project_idx on public.interior_project_media (project_id);
create index interior_project_media_reference_idx on public.interior_project_media (reference_id) where reference_id is not null;

create table public.interior_site_visits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.interior_projects(id) on delete restrict,
  proposed_at timestamptz,
  scheduled_at timestamptz,
  completed_at timestamptz,
  status text not null default 'proposed' check (status in ('proposed', 'scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);
create index interior_site_visits_project_idx on public.interior_site_visits (project_id, scheduled_at);

-- Role checks run as the table owner so RLS on user_roles cannot recurse.
create function public.has_staff_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role in ('admin', 'staff')
  );
$$;

create function public.has_admin_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;
revoke all on function public.has_staff_role() from public, anon;
revoke all on function public.has_admin_role() from public, anon;
grant execute on function public.has_staff_role() to authenticated;
grant execute on function public.has_admin_role() to authenticated;

-- RLS: the public storefront reads published catalogue/gallery content only.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.customers enable row level security;
alter table public.customer_auth_links enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.guest_checkout_sessions enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_media enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;
alter table public.product_variants enable row level security;
alter table public.variant_option_values enable row level security;
alter table public.product_customization_rules enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_customizations enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.shipping_methods enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_request_items enable row level security;
alter table public.quote_request_media enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_revisions enable row level security;
alter table public.quotation_items enable row level security;
alter table public.interior_reference_categories enable row level security;
alter table public.interior_references enable row level security;
alter table public.interior_reference_media enable row level security;
alter table public.interior_projects enable row level security;
alter table public.interior_project_rooms enable row level security;
alter table public.interior_project_media enable row level security;
alter table public.interior_site_visits enable row level security;

-- Remove default table grants; selectively grant client reads/updates below.
revoke all on table
  public.profiles, public.user_roles, public.customers, public.customer_auth_links,
  public.customer_addresses, public.guest_checkout_sessions, public.categories, public.products,
  public.product_categories, public.product_media, public.product_option_groups, public.product_options,
  public.product_variants, public.variant_option_values, public.product_customization_rules,
  public.carts, public.cart_items, public.orders, public.order_items, public.order_item_customizations,
  public.order_status_history, public.payments, public.shipping_zones, public.shipping_methods,
  public.quote_requests, public.quote_request_items, public.quote_request_media, public.quotations,
  public.quotation_revisions, public.quotation_items, public.interior_reference_categories,
  public.interior_references, public.interior_reference_media, public.interior_projects,
  public.interior_project_rooms, public.interior_project_media, public.interior_site_visits
from anon, authenticated;
grant select on public.categories, public.products, public.product_categories, public.product_media,
  public.product_option_groups, public.product_options, public.product_variants,
  public.variant_option_values, public.product_customization_rules,
  public.interior_reference_categories, public.interior_references, public.interior_reference_media,
  public.shipping_zones, public.shipping_methods
  to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.customer_auth_links, public.customers, public.customer_addresses,
  public.orders, public.order_items, public.order_item_customizations, public.order_status_history,
  public.quote_requests, public.quote_request_items, public.quote_request_media,
  public.quotations, public.quotation_revisions, public.quotation_items,
  public.interior_projects, public.interior_project_rooms, public.interior_project_media,
  public.interior_site_visits to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
-- Table grants provide capability only; RLS below limits staff and customer rows.
grant select, insert, update, delete on table
  public.profiles, public.user_roles, public.customers, public.customer_auth_links,
  public.customer_addresses, public.guest_checkout_sessions, public.categories, public.products,
  public.product_categories, public.product_media, public.product_option_groups, public.product_options,
  public.product_variants, public.variant_option_values, public.product_customization_rules,
  public.carts, public.cart_items, public.orders, public.order_items, public.order_item_customizations,
  public.order_status_history, public.payments, public.shipping_zones, public.shipping_methods,
  public.quote_requests, public.quote_request_items, public.quote_request_media, public.quotations,
  public.quotation_revisions, public.quotation_items, public.interior_reference_categories,
  public.interior_references, public.interior_reference_media, public.interior_projects,
  public.interior_project_rooms, public.interior_project_media, public.interior_site_visits
to authenticated;

create policy profiles_select_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy customer_auth_links_select_self on public.customer_auth_links for select to authenticated
  using (user_id = (select auth.uid()));
create policy customers_select_linked on public.customers for select to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = customers.id and l.user_id = (select auth.uid())));
create policy customer_addresses_select_linked on public.customer_addresses for select to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = customer_addresses.customer_id and l.user_id = (select auth.uid())));
create policy customer_addresses_insert_linked on public.customer_addresses for insert to authenticated
  with check (exists (select 1 from public.customer_auth_links l where l.customer_id = customer_addresses.customer_id and l.user_id = (select auth.uid())));
create policy customer_addresses_update_linked on public.customer_addresses for update to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = customer_addresses.customer_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.customer_auth_links l where l.customer_id = customer_addresses.customer_id and l.user_id = (select auth.uid())));
create policy customer_addresses_delete_linked on public.customer_addresses for delete to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = customer_addresses.customer_id and l.user_id = (select auth.uid())));

create policy user_roles_admin_manage on public.user_roles for all to authenticated
  using ((select public.has_admin_role())) with check ((select public.has_admin_role()));

create policy categories_staff_manage on public.categories for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy products_staff_manage on public.products for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy product_categories_staff_manage on public.product_categories for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy product_media_staff_manage on public.product_media for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy product_option_groups_staff_manage on public.product_option_groups for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy product_options_staff_manage on public.product_options for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy product_variants_staff_manage on public.product_variants for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy variant_option_values_staff_manage on public.variant_option_values for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy product_customization_rules_staff_manage on public.product_customization_rules for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy shipping_zones_staff_manage on public.shipping_zones for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy shipping_methods_staff_manage on public.shipping_methods for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_reference_categories_staff_manage on public.interior_reference_categories for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_references_staff_manage on public.interior_references for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_reference_media_staff_manage on public.interior_reference_media for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));

create policy customers_staff_read on public.customers for select to authenticated using ((select public.has_staff_role()));
create policy customer_addresses_staff_read on public.customer_addresses for select to authenticated using ((select public.has_staff_role()));
create policy carts_staff_read on public.carts for select to authenticated using ((select public.has_staff_role()));
create policy cart_items_staff_read on public.cart_items for select to authenticated using ((select public.has_staff_role()));
create policy orders_staff_manage on public.orders for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy order_items_staff_manage on public.order_items for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy order_item_customizations_staff_manage on public.order_item_customizations for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy order_status_history_staff_manage on public.order_status_history for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy payments_staff_manage on public.payments for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy quote_requests_staff_manage on public.quote_requests for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy quote_request_items_staff_manage on public.quote_request_items for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy quote_request_media_staff_manage on public.quote_request_media for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy quotations_staff_manage on public.quotations for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy quotation_revisions_staff_manage on public.quotation_revisions for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy quotation_items_staff_manage on public.quotation_items for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_projects_staff_manage on public.interior_projects for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_project_rooms_staff_manage on public.interior_project_rooms for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_project_media_staff_manage on public.interior_project_media for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));
create policy interior_site_visits_staff_manage on public.interior_site_visits for all to authenticated
  using ((select public.has_staff_role())) with check ((select public.has_staff_role()));

create policy shipping_zones_public_read on public.shipping_zones for select to anon, authenticated using (is_active);
create policy shipping_methods_public_read on public.shipping_methods for select to anon, authenticated
  using (is_active and (valid_from is null or valid_from <= now()) and (valid_until is null or valid_until > now())
    and exists (select 1 from public.shipping_zones z where z.id = zone_id and z.is_active));

create policy categories_public_read on public.categories for select to anon, authenticated using (is_active);
create policy products_public_read on public.products for select to anon, authenticated using (is_published);
create policy product_categories_public_read on public.product_categories for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published)
    and exists (select 1 from public.categories c where c.id = category_id and c.is_active));
create policy product_media_public_read on public.product_media for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));
create policy product_option_groups_public_read on public.product_option_groups for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_published));
create policy product_options_public_read on public.product_options for select to anon, authenticated
  using (is_active and exists (select 1 from public.product_option_groups g join public.products p on p.id = g.product_id where g.id = group_id and p.is_published));
create policy product_variants_public_read on public.product_variants for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_published));
create policy variant_option_values_public_read on public.variant_option_values for select to anon, authenticated
  using (exists (select 1 from public.product_variants v join public.products p on p.id = v.product_id where v.id = variant_id and v.is_active and p.is_published));
create policy product_customization_rules_public_read on public.product_customization_rules for select to anon, authenticated
  using (is_active and not manual_quote_only and (valid_from is null or valid_from <= now()) and (valid_until is null or valid_until > now())
    and exists (select 1 from public.products p where p.id = product_id and p.is_published));

create policy interior_reference_categories_public_read on public.interior_reference_categories for select to anon, authenticated using (is_active);
create policy interior_references_public_read on public.interior_references for select to anon, authenticated using (is_published);
create policy interior_reference_media_public_read on public.interior_reference_media for select to anon, authenticated
  using (exists (select 1 from public.interior_references r where r.id = reference_id and r.is_published));

create policy orders_select_linked_customer on public.orders for select to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = orders.customer_id and l.user_id = (select auth.uid())));
create policy order_items_select_linked_customer on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o join public.customer_auth_links l on l.customer_id = o.customer_id where o.id = order_id and l.user_id = (select auth.uid())));
create policy order_item_customizations_select_linked_customer on public.order_item_customizations for select to authenticated
  using (exists (select 1 from public.order_items i join public.orders o on o.id = i.order_id join public.customer_auth_links l on l.customer_id = o.customer_id where i.id = order_item_id and l.user_id = (select auth.uid())));
create policy order_status_history_select_linked_customer on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o join public.customer_auth_links l on l.customer_id = o.customer_id where o.id = order_id and l.user_id = (select auth.uid())));

create policy quote_requests_select_linked_customer on public.quote_requests for select to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = quote_requests.customer_id and l.user_id = (select auth.uid())));
create policy quote_request_items_select_linked_customer on public.quote_request_items for select to authenticated
  using (exists (select 1 from public.quote_requests q join public.customer_auth_links l on l.customer_id = q.customer_id where q.id = quote_request_id and l.user_id = (select auth.uid())));
create policy quote_request_media_select_linked_customer on public.quote_request_media for select to authenticated
  using (exists (select 1 from public.quote_requests q join public.customer_auth_links l on l.customer_id = q.customer_id where q.id = quote_request_id and l.user_id = (select auth.uid())));
create policy quotations_select_linked_customer on public.quotations for select to authenticated
  using (exists (select 1 from public.quote_requests q join public.customer_auth_links l on l.customer_id = q.customer_id where q.id = quote_request_id and l.user_id = (select auth.uid())));
create policy quotation_revisions_select_linked_customer on public.quotation_revisions for select to authenticated
  using (exists (select 1 from public.quotations qt join public.quote_requests q on q.id = qt.quote_request_id join public.customer_auth_links l on l.customer_id = q.customer_id where qt.id = quotation_id and l.user_id = (select auth.uid())));
create policy quotation_items_select_linked_customer on public.quotation_items for select to authenticated
  using (exists (select 1 from public.quotation_revisions r join public.quotations qt on qt.id = r.quotation_id join public.quote_requests q on q.id = qt.quote_request_id join public.customer_auth_links l on l.customer_id = q.customer_id where r.id = revision_id and l.user_id = (select auth.uid())));

create policy interior_projects_select_linked_customer on public.interior_projects for select to authenticated
  using (exists (select 1 from public.customer_auth_links l where l.customer_id = interior_projects.customer_id and l.user_id = (select auth.uid())));
create policy interior_project_rooms_select_linked_customer on public.interior_project_rooms for select to authenticated
  using (exists (select 1 from public.interior_projects p join public.customer_auth_links l on l.customer_id = p.customer_id where p.id = project_id and l.user_id = (select auth.uid())));
create policy interior_project_media_select_linked_customer on public.interior_project_media for select to authenticated
  using (exists (select 1 from public.interior_projects p join public.customer_auth_links l on l.customer_id = p.customer_id where p.id = project_id and l.user_id = (select auth.uid())));
create policy interior_site_visits_select_linked_customer on public.interior_site_visits for select to authenticated
  using (exists (select 1 from public.interior_projects p join public.customer_auth_links l on l.customer_id = p.customer_id where p.id = project_id and l.user_id = (select auth.uid())));

-- Storage assets are managed through trusted server operations that validate ownership,
-- inspect files, and issue short-lived signed URLs for private customer documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-media', 'product-media', true, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/webm']),
  ('interior-reference-media', 'interior-reference-media', true, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/webm']),
  ('customer-uploads', 'customer-uploads', false, 20971520, array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf']),
  ('quotation-attachments', 'quotation-attachments', false, 20971520, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Direct object writes/reads are only available to authorized staff. Customer files
-- use trusted server operations for ownership checks and short-lived signed URLs.
create policy staff_manage_public_media_objects on storage.objects for all to authenticated
  using (bucket_id in ('product-media', 'interior-reference-media') and (select public.has_staff_role()))
  with check (bucket_id in ('product-media', 'interior-reference-media') and (select public.has_staff_role()));
create policy staff_read_customer_upload_objects on storage.objects for select to authenticated
  using (bucket_id in ('customer-uploads', 'quotation-attachments') and (select public.has_staff_role()));
create policy staff_insert_quotation_attachment_objects on storage.objects for insert to authenticated
  with check (bucket_id = 'quotation-attachments' and (select public.has_staff_role()));
create policy staff_update_quotation_attachment_objects on storage.objects for update to authenticated
  using (bucket_id = 'quotation-attachments' and (select public.has_staff_role()))
  with check (bucket_id = 'quotation-attachments' and (select public.has_staff_role()));
create policy staff_delete_quotation_attachment_objects on storage.objects for delete to authenticated
  using (bucket_id = 'quotation-attachments' and (select public.has_staff_role()));

commit;
