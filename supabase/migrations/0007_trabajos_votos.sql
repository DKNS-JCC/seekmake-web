-- Trabajos: like / dislike counters + atomic vote RPC.
-- Voting is anonymous (no auth). The browser tracks its own vote state
-- in localStorage; the server only keeps aggregate counts.

alter table public.trabajos
  add column if not exists likes    int not null default 0,
  add column if not exists dislikes int not null default 0;

create index if not exists trabajos_likes_idx on public.trabajos (likes desc);

-- Atomic counter update. Deltas are clamped to {-1, 0, 1} so the function
-- cannot be abused to inflate or zero counters by passing big numbers.
-- Counter never goes below zero.
create or replace function public.vote_trabajo(
  p_id            uuid,
  p_like_delta    int,
  p_dislike_delta int
) returns table (likes int, dislikes int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_like int := coalesce(p_like_delta, 0);
  v_dis  int := coalesce(p_dislike_delta, 0);
begin
  if abs(v_like) > 1 or abs(v_dis) > 1 then
    raise exception 'delta out of range (must be -1, 0 or 1)';
  end if;

  return query
    update public.trabajos t
       set likes    = greatest(0, t.likes    + v_like),
           dislikes = greatest(0, t.dislikes + v_dis)
     where t.id = p_id
    returning t.likes, t.dislikes;
end;
$$;

grant execute on function public.vote_trabajo(uuid, int, int) to anon, authenticated;
