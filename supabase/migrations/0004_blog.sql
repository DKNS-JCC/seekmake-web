-- Blog posts table — minimal markdown blog editable from the admin.
-- Public read for published posts; admin write for everything (incl. drafts).

create table if not exists public.blog_posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  excerpt       text not null default '',
  content       text not null default '',           -- markdown
  cover_image   text not null default '',
  published     boolean not null default false,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists blog_posts_published_idx
  on public.blog_posts (published_at desc)
  where published;

create index if not exists blog_posts_slug_idx on public.blog_posts (slug);

-- updated_at trigger reuses public.touch_updated_at() from 0001.
drop trigger if exists touch_blog_posts on public.blog_posts;
create trigger touch_blog_posts before update on public.blog_posts
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.blog_posts enable row level security;

drop policy if exists "blog_posts: public read published" on public.blog_posts;
drop policy if exists "blog_posts: admin all"             on public.blog_posts;

-- Anyone can read posts that are published.
create policy "blog_posts: public read published" on public.blog_posts
  for select using (published = true);

-- Admins can read everything (incl. drafts) and write.
create policy "blog_posts: admin all" on public.blog_posts
  for all using (public.is_admin()) with check (public.is_admin());
