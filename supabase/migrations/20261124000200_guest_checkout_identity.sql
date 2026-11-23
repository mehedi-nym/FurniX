begin;

alter table public.orders
  add column guest_checkout_session_id uuid references public.guest_checkout_sessions(id) on delete restrict;
alter table public.customer_auth_links
  drop constraint customer_auth_links_verification_method_check;
alter table public.customer_auth_links
  add constraint customer_auth_links_verification_method_check
  check (verification_method in ('email_otp', 'email_magic_link', 'phone_otp', 'manual_verified', 'verified_email'));
create unique index orders_guest_checkout_session_uidx
  on public.orders (guest_checkout_session_id)
  where guest_checkout_session_id is not null;

-- This function is intentionally callable only by the server's service-role client.
-- It validates catalogue data, calculates every price, and writes the order atomically.
create function public.create_guest_order(
  p_session_id uuid,
  p_customer jsonb,
  p_delivery jsonb,
  p_shipping_method_id uuid,
  p_items jsonb,
  p_auth_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.guest_checkout_sessions%rowtype;
  v_existing_order public.orders%rowtype;
  v_customer_id uuid;
  v_order_id uuid;
  v_reference text;
  v_currency char(3);
  v_subtotal numeric(12,2) := 0;
  v_delivery_charge numeric(12,2);
  v_free_over numeric(12,2);
  v_total numeric(12,2);
  v_shipping_name text;
  v_item jsonb;
  v_customization jsonb;
  v_product record;
  v_variant record;
  v_option record;
  v_rule record;
  v_dimension record;
  v_option_id uuid;
  v_variant_id uuid;
  v_quantity integer;
  v_base_unit numeric(12,2);
  v_unit_price numeric(12,2);
  v_rule_total numeric(12,2);
  v_line_total numeric(12,2);
  v_dimension_value numeric(12,4);
  v_baseline_value numeric(12,4);
  v_rule_units numeric(12,4);
  v_rule_charge numeric(12,2);
  v_option_snapshot jsonb;
  v_variant_snapshot jsonb;
  v_pricing_snapshot jsonb;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_features jsonb;
  v_options jsonb;
  v_selected boolean;
  v_line_snapshot jsonb;
  v_order_item_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;

  if jsonb_typeof(p_customer) <> 'object'
     or length(trim(coalesce(p_customer->>'full_name', ''))) < 2
     or length(trim(coalesce(p_customer->>'email', ''))) = 0
     or length(trim(coalesce(p_customer->>'phone', ''))) = 0
     or jsonb_typeof(p_delivery) <> 'object'
     or length(trim(coalesce(p_delivery->>'address_line1', ''))) < 3
     or length(trim(coalesce(p_delivery->>'locality', ''))) = 0
     or length(trim(coalesce(p_delivery->>'district', ''))) = 0
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 30 then
    raise exception using errcode = '22023', message = 'invalid checkout details';
  end if;

  select * into v_session
  from public.guest_checkout_sessions
  where id = p_session_id and expires_at > now()
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'invalid checkout session';
  end if;

  -- A retry after a network timeout returns the already-created order.
  select * into v_existing_order
  from public.orders
  where guest_checkout_session_id = p_session_id;
  if found then
    return jsonb_build_object('public_reference', v_existing_order.public_reference);
  end if;

  select sm.charge, sm.free_over_subtotal, sm.name
    into v_delivery_charge, v_free_over, v_shipping_name
  from public.shipping_methods sm
  join public.shipping_zones z on z.id = sm.zone_id
  where sm.id = p_shipping_method_id
    and sm.is_active and z.is_active
    and (sm.valid_from is null or sm.valid_from <= now())
    and (sm.valid_until is null or sm.valid_until > now())
    and (z.district is null or lower(trim(z.district)) = lower(trim(p_delivery->>'district')))
    and (z.locality is null or lower(trim(z.locality)) = lower(trim(p_delivery->>'locality')))
  order by (z.locality is not null) desc, (z.district is not null) desc
  limit 1
  for share of sm, z;
  if not found then
    raise exception using errcode = '22023', message = 'delivery method unavailable';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'product_id', '') = ''
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'invalid cart item';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity < 1 or v_quantity > 20 then
      raise exception using errcode = '22023', message = 'invalid quantity';
    end if;

    v_customization := coalesce(v_item->'customization', '{}'::jsonb);
    if jsonb_typeof(v_customization) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid customization';
    end if;
    v_options := coalesce(v_customization->'options', '[]'::jsonb);
    v_features := coalesce(v_customization->'features', '{}'::jsonb);
    if jsonb_typeof(v_options) <> 'array' or jsonb_typeof(v_features) <> 'object'
       or jsonb_typeof(coalesce(v_customization->'dimensions', '{}'::jsonb)) <> 'object' then
      raise exception using errcode = '22023', message = 'invalid customization';
    end if;

    select p.id, p.name, p.sku, p.currency, p.base_price, p.discount_price, p.dimensions,
      p.stock_quantity, p.availability_status
      into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::uuid
      and p.is_published and p.availability_status <> 'unavailable'
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'product unavailable';
    end if;
    if v_currency is null then
      v_currency := v_product.currency;
    elsif v_currency <> v_product.currency then
      raise exception using errcode = '22023', message = 'mixed currencies';
    end if;

    v_variant_id := nullif(v_item->>'variant_id', '')::uuid;
    v_variant_snapshot := '{}'::jsonb;
    v_base_unit := coalesce(v_product.discount_price, v_product.base_price);
    if v_variant_id is not null then
      select pv.id, pv.sku, pv.price_override, pv.price_delta, pv.stock_quantity
        into v_variant
      from public.product_variants pv
      where pv.id = v_variant_id and pv.product_id = v_product.id and pv.is_active
      for update;
      if not found then
        raise exception using errcode = '22023', message = 'variant unavailable';
      end if;
      v_base_unit := coalesce(v_variant.price_override, v_base_unit) + v_variant.price_delta;
      v_variant_snapshot := jsonb_build_object('sku', v_variant.sku, 'variant_id', v_variant.id);
    elsif exists (select 1 from public.product_variants pv where pv.product_id = v_product.id and pv.is_active) then
      raise exception using errcode = '22023', message = 'variant selection required';
    end if;
    v_unit_price := v_base_unit;
    v_option_snapshot := '[]'::jsonb;

    if jsonb_array_length(v_options) > 30
       or (select count(*) from jsonb_array_elements_text(v_options)) <>
          (select count(distinct value) from jsonb_array_elements_text(v_options)) then
      raise exception using errcode = '22023', message = 'invalid option selections';
    end if;
    for v_option_id in select value::uuid from jsonb_array_elements_text(v_options)
    loop
      select o.id, o.label, o.value, o.price_delta
        into v_option
      from public.product_options o
      join public.product_option_groups g on g.id = o.group_id
      where o.id = v_option_id and o.is_active and g.product_id = v_product.id;
      if not found then
        raise exception using errcode = '22023', message = 'option unavailable';
      end if;
      if v_variant_id is null or not exists (
        select 1 from public.variant_option_values vv
        where vv.variant_id = v_variant_id and vv.option_id = v_option_id
      ) then
        v_unit_price := v_unit_price + v_option.price_delta;
      end if;
      v_option_snapshot := v_option_snapshot || jsonb_build_array(
        jsonb_build_object('id', v_option.id, 'label', v_option.label, 'value', v_option.value)
      );
    end loop;
    if exists (
      select g.id
      from public.product_option_groups g
      where g.product_id = v_product.id and g.is_required
        and not exists (
          select 1 from public.variant_option_values vv
          where vv.variant_id = v_variant_id and vv.group_id = g.id
        )
        and not exists (
          select 1 from public.product_options o
          where o.group_id = g.id and v_options @> jsonb_build_array(o.id::text)
        )
    ) or exists (
      select g.id
      from public.product_option_groups g
      join public.product_options o on o.group_id = g.id
      where g.product_id = v_product.id and g.selection_mode = 'single'
        and v_options @> jsonb_build_array(o.id::text)
      group by g.id
      having count(*) > 1
    ) or (v_variant_id is not null and exists (
      select 1
      from public.variant_option_values vv
      join public.product_option_groups g on g.id = vv.group_id
      join public.product_options selected_option on selected_option.group_id = g.id
      where vv.variant_id = v_variant_id and g.selection_mode = 'single'
        and v_options @> jsonb_build_array(selected_option.id::text)
        and selected_option.id <> vv.option_id
    )) then
      raise exception using errcode = '22023', message = 'required option selection missing or invalid';
    end if;
    v_variant_snapshot := v_variant_snapshot || jsonb_build_object('options', v_option_snapshot);

    if exists (
      select 1 from jsonb_each(v_features) f
      where f.value = 'true'::jsonb and not exists (
        select 1 from public.product_customization_rules r
        where r.product_id = v_product.id and r.target_type = 'feature'
          and r.target_key = f.key and r.is_active
          and (r.valid_from is null or r.valid_from <= now())
          and (r.valid_until is null or r.valid_until > now())
      )
    ) or exists (
      select 1 from jsonb_each(v_features) f
      join public.product_customization_rules r
        on r.product_id = v_product.id and r.target_type = 'feature' and r.target_key = f.key
      where f.value = 'true'::jsonb and r.is_active and r.manual_quote_only
        and (r.valid_from is null or r.valid_from <= now())
        and (r.valid_until is null or r.valid_until > now())
    ) then
      raise exception using errcode = '22023', message = 'custom feature requires a quotation';
    end if;

    if exists (
      select 1 from jsonb_array_elements_text(v_options) selected(value)
      join public.product_customization_rules r
        on r.product_id = v_product.id and r.target_type = 'option' and r.target_key = selected.value
      where r.is_active and r.manual_quote_only
        and (r.valid_from is null or r.valid_from <= now())
        and (r.valid_until is null or r.valid_until > now())
    ) then
      raise exception using errcode = '22023', message = 'option requires a quotation';
    end if;

    -- Reject unsupported dimensions and dimensions that require a manual quote.
    for v_dimension in select key, value from jsonb_each(coalesce(v_customization->'dimensions', '{}'::jsonb))
    loop
      if jsonb_typeof(v_dimension.value) <> 'number'
         or (v_product.dimensions->>v_dimension.key) is null then
        raise exception using errcode = '22023', message = 'dimension unavailable';
      end if;
      v_dimension_value := (v_dimension.value #>> '{}')::numeric;
      v_baseline_value := (v_product.dimensions->>v_dimension.key)::numeric;
      if v_dimension_value <> v_baseline_value and exists (
        select 1 from public.product_customization_rules r
        where r.product_id = v_product.id and r.target_type = 'dimension'
          and r.target_key = v_dimension.key and r.is_active
          and (r.valid_from is null or r.valid_from <= now())
          and (r.valid_until is null or r.valid_until > now())
          and r.manual_quote_only
      ) then
        raise exception using errcode = '22023', message = 'customization requires a quotation';
      end if;
      if v_dimension_value <> v_baseline_value and not exists (
        select 1 from public.product_customization_rules r
        where r.product_id = v_product.id and r.target_type = 'dimension'
          and r.target_key = v_dimension.key and r.is_active and not r.manual_quote_only
          and (r.valid_from is null or r.valid_from <= now())
          and (r.valid_until is null or r.valid_until > now())
      ) then
        raise exception using errcode = '22023', message = 'customization requires a quotation';
      end if;
    end loop;

    v_rule_total := 0;
    v_pricing_snapshot := '[]'::jsonb;
    for v_rule in
      select r.* from public.product_customization_rules r
      where r.product_id = v_product.id and r.is_active and not r.manual_quote_only
        and (r.valid_from is null or r.valid_from <= now())
        and (r.valid_until is null or r.valid_until > now())
      order by r.priority, r.id
      for share
    loop
      v_selected := false;
      v_rule_charge := 0;
      if v_rule.target_type = 'dimension'
         and (v_customization->'dimensions') ? v_rule.target_key then
        v_dimension_value := ((v_customization->'dimensions'->>v_rule.target_key)::numeric);
        v_baseline_value := ((v_product.dimensions->>v_rule.target_key)::numeric);
        v_selected := v_dimension_value <> v_baseline_value;
        if v_selected and ((v_rule.minimum_value is not null and v_dimension_value < v_rule.minimum_value)
            or (v_rule.maximum_value is not null and v_dimension_value > v_rule.maximum_value)) then
          raise exception using errcode = '22023', message = 'dimension outside allowed range';
        end if;
      elsif v_rule.target_type = 'option' then
        v_selected := exists (select 1 from jsonb_array_elements_text(v_options) o(value) where o.value = v_rule.target_key);
      elsif v_rule.target_type = 'feature' then
        v_selected := coalesce((v_features->>v_rule.target_key)::boolean, false);
      end if;

      if v_selected then
        if v_rule.charge_type = 'fixed' then
          v_rule_charge := round(v_rule.amount * v_quantity, 2);
        elsif v_rule.charge_type = 'per_unit' then
          if v_rule.per_unit_basis = 'dimension_delta' then
            if v_rule.target_type <> 'dimension' then
              raise exception using errcode = '22023', message = 'invalid pricing rule';
            end if;
            v_dimension_value := ((v_customization->'dimensions'->>v_rule.target_key)::numeric);
            v_baseline_value := ((v_product.dimensions->>v_rule.target_key)::numeric);
            v_rule_units := greatest(v_dimension_value - v_baseline_value, 0);
            v_rule_charge := round(v_rule.amount * v_rule_units * v_quantity, 2);
          elsif v_rule.per_unit_basis = 'quantity' then
            v_rule_charge := round(v_rule.amount * v_quantity, 2);
          else
            v_rule_charge := round(v_rule.amount * v_quantity, 2);
          end if;
        elsif v_rule.charge_type = 'percentage' then
          v_rule_charge := round(
            (case when v_rule.percentage_base = 'base_price' then v_base_unit else v_unit_price end)
            * v_rule.amount / 100 * v_quantity,
            2
          );
        end if;
        v_rule_total := v_rule_total + v_rule_charge;
        v_pricing_snapshot := v_pricing_snapshot || jsonb_build_array(
          jsonb_build_object('rule_id', v_rule.id, 'name', v_rule.name, 'charge', v_rule_charge, 'currency', v_product.currency)
        );
      end if;
    end loop;

    -- Decrement finite stock while holding the row lock. Any later failure rolls
    -- the full checkout transaction back, including these stock changes.
    if v_product.availability_status = 'available' then
      if v_variant_id is not null then
        update public.product_variants
        set stock_quantity = case when stock_quantity is null then null else stock_quantity - v_quantity end,
            updated_at = now()
        where id = v_variant_id and is_active
          and (stock_quantity is null or stock_quantity >= v_quantity);
        if not found then
          raise exception using errcode = '22023', message = 'variant out of stock';
        end if;
      else
        update public.products
        set stock_quantity = case when stock_quantity is null then null else stock_quantity - v_quantity end,
            updated_at = now()
        where id = v_product.id
          and (stock_quantity is null or stock_quantity >= v_quantity);
        if not found then
          raise exception using errcode = '22023', message = 'product out of stock';
        end if;
      end if;
    end if;

    v_line_total := round(v_unit_price * v_quantity + v_rule_total, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_items_snapshot := v_items_snapshot || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', v_variant_id,
      'name', v_product.name,
      'sku', v_product.sku,
      'variant_snapshot', v_variant_snapshot,
      'unit_price', round(v_line_total / v_quantity, 2),
      'quantity', v_quantity,
      'line_total', v_line_total,
      'customization', v_customization,
      'pricing_breakdown', v_pricing_snapshot
    ));
  end loop;

  if v_currency <> 'BDT' then
    raise exception using errcode = '22023', message = 'currency not configured';
  end if;
  if v_free_over is not null and v_subtotal >= v_free_over then
    v_delivery_charge := 0;
  end if;
  v_total := v_subtotal + v_delivery_charge;

  if p_auth_user_id is not null and exists (
    select 1 from auth.users u where u.id = p_auth_user_id and u.email_confirmed_at is not null
  ) then
    select l.customer_id into v_customer_id
    from public.customer_auth_links l
    where l.user_id = p_auth_user_id and l.verified_at is not null;
  end if;

  if v_customer_id is null then
    insert into public.customers (full_name, email, phone)
    values (trim(p_customer->>'full_name'), trim(p_customer->>'email'), trim(p_customer->>'phone'))
    returning id into v_customer_id;
  end if;

  v_reference := 'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  insert into public.orders (
    public_reference, customer_id, guest_checkout_session_id, status, payment_status, currency,
    subtotal, discount_total, delivery_total, tax_total, total,
    contact_name, contact_email, contact_phone, delivery_address, delivery_notes, installation_notes
  ) values (
    v_reference, v_customer_id, p_session_id, 'pending', 'unpaid', v_currency,
    v_subtotal, 0, v_delivery_charge, 0, v_total,
    trim(p_customer->>'full_name'), lower(trim(p_customer->>'email')), trim(p_customer->>'phone'),
    p_delivery || jsonb_build_object('shipping_method_id', p_shipping_method_id, 'shipping_method_name', v_shipping_name),
    nullif(trim(p_delivery->>'delivery_notes'), ''), nullif(trim(p_delivery->>'installation_notes'), '')
  ) returning id into v_order_id;

  for v_line_snapshot in select value from jsonb_array_elements(v_items_snapshot)
  loop
    insert into public.order_items (
      order_id, product_id, variant_id, product_name_snapshot, sku_snapshot,
      variant_snapshot, unit_price, quantity, line_total
    ) values (
      v_order_id,
      (v_line_snapshot->>'product_id')::uuid,
      nullif(v_line_snapshot->>'variant_id', '')::uuid,
      v_line_snapshot->>'name',
      v_line_snapshot->>'sku',
      v_line_snapshot->'variant_snapshot',
      (v_line_snapshot->>'unit_price')::numeric,
      (v_line_snapshot->>'quantity')::integer,
      (v_line_snapshot->>'line_total')::numeric
    ) returning id into v_order_item_id;

    insert into public.order_item_customizations (
      order_item_id, customization_snapshot, pricing_breakdown_snapshot
    ) values (
      v_order_item_id,
      coalesce(v_line_snapshot->'customization', '{}'::jsonb),
      coalesce(v_line_snapshot->'pricing_breakdown', '[]'::jsonb)
    );
  end loop;

  insert into public.order_status_history (order_id, status, actor_source, customer_note)
  values (v_order_id, 'pending', 'system', 'Order received');

  update public.guest_checkout_sessions
  set customer_id = v_customer_id, last_seen_at = now()
  where id = p_session_id;

  update public.carts set status = 'converted', updated_at = now()
  where guest_session_id = p_session_id and status = 'active';

  return jsonb_build_object('public_reference', v_reference);
end;
$$;

revoke all on function public.create_guest_order(uuid, jsonb, jsonb, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_guest_order(uuid, jsonb, jsonb, uuid, jsonb, uuid) to service_role;

-- Link/merge guest records only after Supabase Auth has verified the user's email.
create function public.claim_customer_records()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_customer_id uuid;
  v_duplicate_id uuid;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'verified identity required';
  end if;

  select lower(trim(u.email)), nullif(trim(u.raw_user_meta_data->>'full_name'), '')
    into v_email, v_name
  from auth.users u
  where u.id = v_user_id and u.email_confirmed_at is not null
  for update;
  if v_email is null then
    raise exception using errcode = '42501', message = 'verified email required';
  end if;

  select l.customer_id into v_customer_id
  from public.customer_auth_links l where l.user_id = v_user_id;

  if v_customer_id is null then
    select c.id into v_customer_id
    from public.customers c
    where c.email_normalized = v_email
      and not exists (select 1 from public.customer_auth_links l where l.customer_id = c.id)
    order by c.created_at, c.id
    limit 1
    for update;
  end if;

  if v_customer_id is null then
    insert into public.customers (full_name, email, phone)
    values (coalesce(v_name, v_email), v_email, 'unprovided')
    returning id into v_customer_id;
  end if;

  insert into public.profiles as existing_profile (id, display_name)
  values (v_user_id, v_name)
  on conflict (id) do update
  set display_name = coalesce(existing_profile.display_name, excluded.display_name),
      updated_at = now();

  -- Merge only unclaimed profiles with this verified email. A profile already
  -- linked to another Auth identity is intentionally left untouched.
  for v_duplicate_id in
    select c.id from public.customers c
    where c.email_normalized = v_email and c.id <> v_customer_id
      and not exists (select 1 from public.customer_auth_links l where l.customer_id = c.id)
    order by c.created_at, c.id
    for update
  loop
    update public.customer_addresses set is_default = false where customer_id = v_duplicate_id;
    update public.customer_addresses set customer_id = v_customer_id where customer_id = v_duplicate_id;
    update public.guest_checkout_sessions set customer_id = v_customer_id where customer_id = v_duplicate_id;
    update public.carts set customer_id = v_customer_id where customer_id = v_duplicate_id;
    update public.orders set customer_id = v_customer_id where customer_id = v_duplicate_id;
    update public.quote_requests set customer_id = v_customer_id where customer_id = v_duplicate_id;
    update public.interior_projects set customer_id = v_customer_id where customer_id = v_duplicate_id;
    delete from public.customers where id = v_duplicate_id;
  end loop;

  update public.customers set email = v_email, updated_at = now() where id = v_customer_id;
  insert into public.customer_auth_links (customer_id, user_id, verified_at, verification_method)
  values (v_customer_id, v_user_id, now(), 'verified_email')
  on conflict (user_id) do nothing;

  return v_customer_id;
end;
$$;

revoke all on function public.claim_customer_records() from public, anon;
grant execute on function public.claim_customer_records() to authenticated;

commit;
