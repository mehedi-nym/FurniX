begin;

alter table public.quotation_revisions
  add column customer_response_by uuid references auth.users(id) on delete set null;

-- Customer profile edits and quote responses go through narrowly scoped
-- functions so the customer app never needs service-role credentials.
create function public.update_own_customer_profile(p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null
     or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     or not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
     or length(trim(coalesce(p_full_name, ''))) < 2
     or length(trim(coalesce(p_full_name, ''))) > 120
     or length(trim(coalesce(p_phone, ''))) < 6
     or length(trim(coalesce(p_phone, ''))) > 40 then
    raise exception using errcode = '22023', message = 'invalid profile details';
  end if;

  select l.customer_id into v_customer_id
  from public.customer_auth_links l
  where l.user_id = auth.uid() and l.verified_at is not null;
  if v_customer_id is null then
    raise exception using errcode = '42501', message = 'verified customer identity required';
  end if;

  update public.customers
  set full_name = trim(p_full_name), phone = trim(p_phone), updated_at = now()
  where id = v_customer_id;
end;
$$;

create function public.respond_to_quotation(
  p_quotation_id uuid,
  p_revision_number integer,
  p_response text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quotation public.quotations%rowtype;
  v_customer_id uuid;
begin
  if auth.role() <> 'authenticated' or auth.uid() is null
     or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     or not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
     or coalesce(p_response, '') not in ('accepted', 'rejected') then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;

  select * into v_quotation
  from public.quotations q
  where q.id = p_quotation_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'quotation not found';
  end if;

  select l.customer_id into v_customer_id
  from public.customer_auth_links l
  where l.user_id = auth.uid() and l.verified_at is not null;

  if v_customer_id is null or not (
    exists (select 1 from public.quote_requests r where r.id = v_quotation.quote_request_id and r.customer_id = v_customer_id)
    or exists (select 1 from public.interior_quote_requests r where r.id = v_quotation.interior_quote_request_id and r.customer_id = v_customer_id)
  ) then
    raise exception using errcode = '42501', message = 'not authorized';
  end if;

  if v_quotation.status <> 'sent' or v_quotation.expires_at is not null and v_quotation.expires_at <= now() then
    raise exception using errcode = '22023', message = 'quotation is not open for a response';
  end if;

  update public.quotation_revisions
  set status = p_response,
      customer_response_at = now(),
      customer_response_by = auth.uid()
  where quotation_id = v_quotation.id
    and revision_number = p_revision_number
    and revision_number = v_quotation.current_revision
    and status = 'sent'
    and (valid_until is null or valid_until > now());
  if not found then
    raise exception using errcode = '22023', message = 'quotation revision is not open for a response';
  end if;

  update public.quotations
  set status = p_response, updated_at = now()
  where id = v_quotation.id;
end;
$$;

revoke all on function public.update_own_customer_profile(text, text) from public, anon;
grant execute on function public.update_own_customer_profile(text, text) to authenticated;
revoke all on function public.respond_to_quotation(uuid, integer, text) from public, anon;
grant execute on function public.respond_to_quotation(uuid, integer, text) to authenticated;

commit;
