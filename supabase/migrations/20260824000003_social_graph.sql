-- =============================================================================
-- Mira — 0003: grafo social (amistades, solicitudes, bloqueos)
-- =============================================================================

-- --- Bloqueos -----------------------------------------------------------------
-- Direccional y con prioridad sobre todo lo demás: si existe un bloqueo en
-- cualquier dirección, las dos personas dejan de verse por completo (§25).
create table blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on blocks (blocked_id);

-- --- Amistades ----------------------------------------------------------------
-- Par canónico (user_a < user_b) para que exista una sola fila por relación y
-- las consultas no tengan que mirar en las dos direcciones.
create table friendships (
  user_a     uuid not null references profiles (id) on delete cascade,
  user_b     uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint canonical_order check (user_a < user_b)
);

create index friendships_user_b_idx on friendships (user_b);

-- --- Solicitudes de amistad ---------------------------------------------------
create table friend_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles (id) on delete cascade,
  addressee_id  uuid not null references profiles (id) on delete cascade,
  status        friend_request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  constraint no_self_request check (requester_id <> addressee_id)
);

-- Una sola solicitud pendiente por par y por dirección.
create unique index friend_requests_unique_pending
  on friend_requests (requester_id, addressee_id)
  where status = 'pending';

create index friend_requests_addressee_idx on friend_requests (addressee_id, status, created_at desc);
create index friend_requests_requester_idx on friend_requests (requester_id, status, created_at desc);

-- --- Aceptar una solicitud crea la amistad ------------------------------------
create or replace function friend_request_on_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    insert into friendships (user_a, user_b)
    values (
      least(new.requester_id, new.addressee_id),
      greatest(new.requester_id, new.addressee_id)
    )
    on conflict do nothing;

    new.responded_at := now();

  elsif new.status in ('rejected', 'cancelled') and old.status = 'pending' then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

create trigger friend_requests_accept
  before update of status on friend_requests
  for each row execute function friend_request_on_accept();

-- --- Bloquear destruye la relación existente ----------------------------------
create or replace function block_cascade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from friendships
   where user_a = least(new.blocker_id, new.blocked_id)
     and user_b = greatest(new.blocker_id, new.blocked_id);

  update friend_requests
     set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and ((requester_id = new.blocker_id and addressee_id = new.blocked_id)
       or (requester_id = new.blocked_id and addressee_id = new.blocker_id));

  return new;
end;
$$;

create trigger blocks_cascade
  after insert on blocks
  for each row execute function block_cascade();

-- --- No se puede pedir amistad a quien te bloqueó -----------------------------
create or replace function reject_request_if_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from blocks
     where (blocker_id = new.requester_id and blocked_id = new.addressee_id)
        or (blocker_id = new.addressee_id and blocked_id = new.requester_id)
  ) then
    raise exception 'blocked_relationship' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger friend_requests_block_guard
  before insert on friend_requests
  for each row execute function reject_request_if_blocked();
