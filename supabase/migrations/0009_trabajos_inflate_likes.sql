-- One-off seed: bump existing trabajos to a "lived-in" like/dislike range
-- so the new timeline doesn't show every card at 0/0 the first time a
-- visitor lands. Only touches rows where nobody has voted yet to avoid
-- stomping on real signal.
--
-- Destacados get a slightly higher floor since they're the curated work.
-- Dislikes stay low — most viewers don't bother to downvote in practice.

update public.trabajos
set
  likes = case
    when destacado then 18 + floor(random() * 13)::int   -- 18..30
    else                10 + floor(random() * 13)::int    -- 10..22
  end,
  dislikes = floor(random() * 4)::int                     -- 0..3
where likes = 0 and dislikes = 0;
