-- Delegated Workup Studio author access.
-- Reviewers/admins can assign authors to individual workups; assigned authors can draft only those workups.

create table if not exists public.workup_author_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  workup_id text not null references public.workups(id) on delete cascade,
  role text not null default 'author' check (role in ('author', 'reviewer')),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, workup_id)
);

create or replace function public.can_edit_workup_content(target_workup_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.can_review_workup_content()
    or exists (
      select 1
      from public.workup_author_assignments assignment
      where assignment.user_id = auth.uid()
        and assignment.workup_id = target_workup_id
        and assignment.role in ('author', 'reviewer')
    );
$$;

revoke execute on function public.current_workup_author_role() from public;
revoke execute on function public.can_review_workup_content() from public;
revoke execute on function public.can_edit_workup_content(text) from public;
grant execute on function public.current_workup_author_role() to authenticated, service_role;
grant execute on function public.can_review_workup_content() to authenticated, service_role;
grant execute on function public.can_edit_workup_content(text) to authenticated, service_role;

create index if not exists workup_author_assignments_workup_idx
on public.workup_author_assignments(workup_id, role);

alter table public.workup_author_assignments enable row level security;

drop policy if exists "authors can read own workup assignments" on public.workup_author_assignments;
create policy "authors can read own workup assignments"
on public.workup_author_assignments
for select
to authenticated
using (user_id = auth.uid() or public.can_review_workup_content());

drop policy if exists "reviewers can maintain workup assignments" on public.workup_author_assignments;
create policy "reviewers can maintain workup assignments"
on public.workup_author_assignments
for all
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());

drop policy if exists "authors can read relevant change sets" on public.change_sets;
create policy "authors can read relevant change sets"
on public.change_sets
for select
to authenticated
using (
  author_id = auth.uid()
  or public.can_edit_workup_content(workup_id)
  or public.can_review_workup_content()
);

drop policy if exists "users can read reviewed authoring content" on public.sources;
drop policy if exists "assigned authors can read relevant sources" on public.sources;
create policy "assigned authors can read relevant sources"
on public.sources
for select
to authenticated
using (
  public.can_review_workup_content()
  or exists (
    select 1
    from public.workups workup
    where public.can_edit_workup_content(workup.id)
      and (
        public.sources.id = any(workup.source_ids)
        or public.sources.source_id = any(workup.source_ids)
      )
  )
);

drop policy if exists "users can read workups" on public.workups;
drop policy if exists "assigned authors can read workups" on public.workups;
create policy "assigned authors can read workups"
on public.workups
for select
to authenticated
using (public.can_edit_workup_content(id));

drop policy if exists "users can read workup sections" on public.workup_sections;
drop policy if exists "assigned authors can read workup sections" on public.workup_sections;
create policy "assigned authors can read workup sections"
on public.workup_sections
for select
to authenticated
using (public.can_edit_workup_content(workup_id));

drop policy if exists "users can read workup items" on public.workup_items;
drop policy if exists "assigned authors can read workup items" on public.workup_items;
create policy "assigned authors can read workup items"
on public.workup_items
for select
to authenticated
using (public.can_edit_workup_content(workup_id));

drop policy if exists "users can read pathway trees" on public.pathway_trees;
drop policy if exists "assigned authors can read pathway trees" on public.pathway_trees;
create policy "assigned authors can read pathway trees"
on public.pathway_trees
for select
to authenticated
using (public.can_edit_workup_content(workup_id));

drop policy if exists "users can read pathway nodes" on public.pathway_nodes;
drop policy if exists "assigned authors can read pathway nodes" on public.pathway_nodes;
create policy "assigned authors can read pathway nodes"
on public.pathway_nodes
for select
to authenticated
using (
  exists (
    select 1
    from public.pathway_trees tree
    where tree.id = public.pathway_nodes.tree_id
      and public.can_edit_workup_content(tree.workup_id)
  )
);

drop policy if exists "users can read review cases" on public.review_cases;
drop policy if exists "assigned authors can read review cases" on public.review_cases;
create policy "assigned authors can read review cases"
on public.review_cases
for select
to authenticated
using (public.can_edit_workup_content(workup_id));

drop policy if exists "authors can draft their own change sets" on public.change_sets;
drop policy if exists "assigned authors can draft their own change sets" on public.change_sets;
create policy "assigned authors can draft their own change sets"
on public.change_sets
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.can_edit_workup_content(workup_id)
  and review_status in ('draft', 'submitted')
  and export_ready = false
);

drop policy if exists "authors can update unapproved own change sets" on public.change_sets;
drop policy if exists "assigned authors can update unapproved own change sets" on public.change_sets;
create policy "assigned authors can update unapproved own change sets"
on public.change_sets
for update
to authenticated
using (
  author_id = auth.uid()
  and public.can_edit_workup_content(workup_id)
  and review_status in ('draft', 'submitted')
)
with check (
  author_id = auth.uid()
  and public.can_edit_workup_content(workup_id)
  and review_status in ('draft', 'submitted')
  and export_ready = false
);

drop policy if exists "reviewers can insert reviewed change sets" on public.change_sets;
create policy "reviewers can insert reviewed change sets"
on public.change_sets
for insert
to authenticated
with check (public.can_review_workup_content());
