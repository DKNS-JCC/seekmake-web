-- Per-voter vote tracking via a browser-stored UUID (cookie + localStorage).
-- Same browser can no longer vote twice on the same trabajo even after
-- clearing localStorage — the cookie restores the UUID. The aggregate
-- counters on `trabajos` are kept in sync atomically inside the RPC.

create table if not exists public.trabajos_votos (
  trabajo_id  uuid not null references public.trabajos(id) on delete cascade,
  voter_id    uuid not null,
  vote        text not null check (vote in ('like', 'dislike')),
  created_at  timestamptz not null default now(),
  primary key (trabajo_id, voter_id)
);

create index if not exists trabajos_votos_voter_idx
  on public.trabajos_votos (voter_id);

alter table public.trabajos_votos enable row level security;

-- Direct table access stays closed for anon; everything goes through
-- the SECURITY DEFINER RPCs. Admins can browse for moderation.
drop policy if exists "trabajos_votos: admin read" on public.trabajos_votos;
create policy "trabajos_votos: admin read" on public.trabajos_votos
  for select using (public.is_admin());

-- ── Vote RPC ──────────────────────────────────────────────────────────
-- New signature replaces the old delta-based one. Caller passes their
-- voter_id and the target action ('like' | 'dislike' | 'clear'); the
-- function figures out the deltas from the existing vote (if any).

drop function if exists public.vote_trabajo(uuid, int, int);

create or replace function public.vote_trabajo(
  p_id        uuid,
  p_voter_id  uuid,
  p_target    text
) returns table (likes int, dislikes int, my_vote text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing   text;
  v_like_delta int := 0;
  v_dis_delta  int := 0;
  v_new_vote   text;
begin
  if p_target not in ('like', 'dislike', 'clear') then
    raise exception 'invalid target (must be like, dislike or clear)';
  end if;

  select vote into v_existing
    from public.trabajos_votos
   where trabajo_id = p_id and voter_id = p_voter_id;

  if p_target = 'clear' or p_target = v_existing then
    -- Remove the vote (explicit clear OR clicking the same button again).
    if v_existing = 'like'    then v_like_delta := -1; end if;
    if v_existing = 'dislike' then v_dis_delta  := -1; end if;
    delete from public.trabajos_votos
     where trabajo_id = p_id and voter_id = p_voter_id;
    v_new_vote := null;
  else
    -- New vote, or switching from like ↔ dislike.
    if v_existing = 'like'    then v_like_delta := -1; end if;
    if v_existing = 'dislike' then v_dis_delta  := -1; end if;
    if p_target = 'like'      then v_like_delta := v_like_delta + 1; end if;
    if p_target = 'dislike'   then v_dis_delta  := v_dis_delta  + 1; end if;

    insert into public.trabajos_votos (trabajo_id, voter_id, vote)
    values (p_id, p_voter_id, p_target)
    on conflict (trabajo_id, voter_id)
      do update set vote = excluded.vote, created_at = now();
    v_new_vote := p_target;
  end if;

  return query
    update public.trabajos t
       set likes    = greatest(0, t.likes    + v_like_delta),
           dislikes = greatest(0, t.dislikes + v_dis_delta)
     where t.id = p_id
    returning t.likes, t.dislikes, v_new_vote;
end;
$$;

grant execute on function public.vote_trabajo(uuid, uuid, text) to anon, authenticated;

-- ── Helper: load this user's votes for a list of trabajos ─────────────
-- Used once on timeline load so the heart/down arrow appears active on
-- the trabajos this user has already voted, across page navigations.

create or replace function public.get_my_trabajo_votes(
  p_voter_id    uuid,
  p_trabajo_ids uuid[]
) returns table (trabajo_id uuid, vote text)
language sql
security definer
set search_path = public
as $$
  select trabajo_id, vote
    from public.trabajos_votos
   where voter_id = p_voter_id
     and trabajo_id = any(p_trabajo_ids);
$$;

grant execute on function public.get_my_trabajo_votes(uuid, uuid[]) to anon, authenticated;
