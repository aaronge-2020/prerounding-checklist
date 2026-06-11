-- Workup Studio authoring database.
-- Patient/vault data must not be written to these tables.

create table if not exists public.workup_author_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'author' check (role in ('author', 'reviewer', 'admin')),
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.current_workup_author_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select role
      from public.workup_author_profiles
      where user_id = auth.uid()
      limit 1
    ),
    'author'
  );
$$;

create or replace function public.can_review_workup_content()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_workup_author_role() in ('reviewer', 'admin');
$$;

create table if not exists public.sources (
  id text primary key,
  source_id text not null unique,
  title text not null,
  source_type text,
  url text,
  version text,
  date_accessed text,
  review_owner text,
  reviewed_by_role text,
  last_reviewed text,
  next_review_due text,
  currency_status text,
  citation text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workups (
  id text primary key,
  title text not null,
  version text,
  status text not null default 'draft',
  complaint_group text,
  population jsonb not null default '{}'::jsonb,
  module_path text,
  source_ids text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workup_sections (
  id text primary key,
  workup_id text not null references public.workups(id) on delete cascade,
  section_key text not null,
  label text not null,
  description text,
  kind text not null check (kind in ('pathway', 'items', 'sources', 'review')),
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  source_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workup_id, section_key)
);

create table if not exists public.workup_items (
  id text primary key,
  workup_id text not null references public.workups(id) on delete cascade,
  section_key text not null,
  group_key text not null,
  item_id text not null,
  item_type text,
  label text not null,
  sort_order integer not null default 0,
  source_ids text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workup_id, group_key, item_id)
);

create table if not exists public.pathway_trees (
  id text primary key,
  workup_id text not null references public.workups(id) on delete cascade,
  section_key text not null default 'clinical_pathway_tree_v1',
  title text not null,
  status text not null default 'draft',
  source_ids text[] not null default '{}'::text[],
  activation_rules jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workup_id, section_key)
);

create table if not exists public.pathway_nodes (
  id text primary key,
  tree_id text not null references public.pathway_trees(id) on delete cascade,
  node_id text not null,
  parent_node_id text,
  depth integer not null default 0,
  sort_order integer not null default 0,
  label text not null,
  node_type text not null check (node_type in ('action', 'decision', 'endpoint')),
  edge_label text,
  source_ids text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tree_id, node_id)
);

create table if not exists public.review_cases (
  id text primary key,
  workup_id text not null references public.workups(id) on delete cascade,
  case_id text not null,
  case_type text not null check (case_type in ('gold_case', 'synthetic_pathway_scenario')),
  sort_order integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workup_id, case_type, case_id)
);

create table if not exists public.change_sets (
  id text primary key,
  schema text not null default 'workup_change_set_v1',
  workup_id text not null references public.workups(id) on delete cascade,
  section_key text not null,
  operations jsonb not null default '[]'::jsonb,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  source_ids text[] not null default '{}'::text[],
  review_status text not null default 'draft' check (review_status in ('draft', 'submitted', 'approved', 'rejected')),
  export_ready boolean not null default false,
  author_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_notes text,
  imported_evidence jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  exported_at timestamptz
);

create index if not exists workup_sections_workup_id_idx on public.workup_sections(workup_id);
create index if not exists workup_sections_key_idx on public.workup_sections(section_key);
create index if not exists workup_items_workup_id_idx on public.workup_items(workup_id);
create index if not exists workup_items_section_idx on public.workup_items(workup_id, section_key, sort_order);
create index if not exists pathway_trees_workup_id_idx on public.pathway_trees(workup_id);
create index if not exists pathway_nodes_tree_id_idx on public.pathway_nodes(tree_id, parent_node_id, sort_order);
create index if not exists review_cases_workup_id_idx on public.review_cases(workup_id);
create index if not exists change_sets_workup_section_idx on public.change_sets(workup_id, section_key, created_at desc);
create index if not exists change_sets_review_status_idx on public.change_sets(review_status, export_ready) where review_status in ('submitted', 'approved');
create index if not exists workups_source_ids_gin_idx on public.workups using gin(source_ids);
create index if not exists workup_items_source_ids_gin_idx on public.workup_items using gin(source_ids);
create index if not exists change_sets_source_ids_gin_idx on public.change_sets using gin(source_ids);
create index if not exists pathway_trees_payload_gin_idx on public.pathway_trees using gin(payload jsonb_path_ops);
create index if not exists change_sets_after_snapshot_gin_idx on public.change_sets using gin(after_snapshot jsonb_path_ops);

alter table public.workup_author_profiles enable row level security;
alter table public.sources enable row level security;
alter table public.workups enable row level security;
alter table public.workup_sections enable row level security;
alter table public.workup_items enable row level security;
alter table public.pathway_trees enable row level security;
alter table public.pathway_nodes enable row level security;
alter table public.review_cases enable row level security;
alter table public.change_sets enable row level security;

create policy "authors can read author profiles"
on public.workup_author_profiles
for select
to authenticated
using (user_id = auth.uid() or public.can_review_workup_content());

create policy "users can read reviewed authoring content"
on public.sources
for select
to authenticated
using (true);

create policy "users can read workups"
on public.workups
for select
to authenticated
using (true);

create policy "users can read workup sections"
on public.workup_sections
for select
to authenticated
using (true);

create policy "users can read workup items"
on public.workup_items
for select
to authenticated
using (true);

create policy "users can read pathway trees"
on public.pathway_trees
for select
to authenticated
using (true);

create policy "users can read pathway nodes"
on public.pathway_nodes
for select
to authenticated
using (true);

create policy "users can read review cases"
on public.review_cases
for select
to authenticated
using (true);

create policy "reviewers can maintain canonical authoring tables"
on public.sources
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "reviewers can maintain workups"
on public.workups
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "reviewers can maintain workup sections"
on public.workup_sections
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "reviewers can maintain workup items"
on public.workup_items
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "reviewers can maintain pathway trees"
on public.pathway_trees
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "reviewers can maintain pathway nodes"
on public.pathway_nodes
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "reviewers can maintain review cases"
on public.review_cases
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "authors can read relevant change sets"
on public.change_sets
for select
to authenticated
using (author_id = auth.uid() or public.can_review_workup_content() or review_status = 'approved');

create policy "authors can draft their own change sets"
on public.change_sets
for insert
to authenticated
with check (
  author_id = auth.uid()
  and review_status in ('draft', 'submitted')
  and export_ready = false
);

create policy "authors can update unapproved own change sets"
on public.change_sets
for update
to authenticated
using (author_id = auth.uid() and review_status in ('draft', 'submitted'))
with check (
  author_id = auth.uid()
  and review_status in ('draft', 'submitted')
  and export_ready = false
);

create policy "reviewers can approve exportable change sets"
on public.change_sets
for update
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

create policy "reviewers can insert reviewed change sets"
on public.change_sets
for insert
to authenticated
with check (public.can_review_workup_content() or author_id = auth.uid());
