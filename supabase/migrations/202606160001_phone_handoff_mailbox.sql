create table if not exists public.phone_handoff_mailbox (
  id text primary key,
  ciphertext text not null,
  iv text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists phone_handoff_mailbox_expires_at_idx
on public.phone_handoff_mailbox(expires_at);

alter table public.phone_handoff_mailbox enable row level security;

revoke all on public.phone_handoff_mailbox from anon, authenticated;

create or replace function public.put_phone_handoff_mailbox(
  p_id text,
  p_ciphertext text,
  p_iv text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expires_at timestamptz;
begin
  delete from public.phone_handoff_mailbox
  where expires_at < now();

  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'Invalid handoff mailbox id.';
  end if;

  if p_iv is null or p_iv !~ '^[A-Za-z0-9_-]{12,64}$' then
    raise exception 'Invalid handoff mailbox iv.';
  end if;

  if p_ciphertext is null or length(p_ciphertext) < 16 or length(p_ciphertext) > 262144 then
    raise exception 'Invalid handoff mailbox ciphertext.';
  end if;

  v_expires_at := coalesce(p_expires_at, now() + interval '10 minutes');
  v_expires_at := least(v_expires_at, now() + interval '30 minutes');

  if v_expires_at <= now() then
    raise exception 'Invalid handoff mailbox expiration.';
  end if;

  insert into public.phone_handoff_mailbox(id, ciphertext, iv, expires_at)
  values (p_id, p_ciphertext, p_iv, v_expires_at);

  return jsonb_build_object('ok', true, 'expires_at', v_expires_at);
end;
$$;

create or replace function public.get_phone_handoff_mailbox(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.phone_handoff_mailbox%rowtype;
begin
  delete from public.phone_handoff_mailbox
  where expires_at < now();

  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{16,64}$' then
    return null;
  end if;

  select *
  into v_row
  from public.phone_handoff_mailbox
  where id = p_id
    and expires_at > now();

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'ciphertext', v_row.ciphertext,
    'iv', v_row.iv,
    'expires_at', v_row.expires_at
  );
end;
$$;

create or replace function public.delete_phone_handoff_mailbox(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{16,64}$' then
    return false;
  end if;

  delete from public.phone_handoff_mailbox
  where id = p_id;

  return found;
end;
$$;

grant execute on function public.put_phone_handoff_mailbox(text, text, text, timestamptz) to anon, authenticated;
grant execute on function public.get_phone_handoff_mailbox(text) to anon, authenticated;
grant execute on function public.delete_phone_handoff_mailbox(text) to anon, authenticated;
