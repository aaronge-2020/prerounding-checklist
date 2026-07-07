-- Brand-new workup drafts submitted for reviewer approval.
-- Unlike change_sets (which patch an existing workups row), a new workup has
-- no workups row yet, so it is staged here until a reviewer approves it and
-- the app writes the corresponding workups/workup_sections/workup_items rows.

create table if not exists public.new_workup_submissions (
  id text primary key,
  workup_id text not null,
  title text not null,
  draft jsonb not null,
  review_status text not null default 'submitted' check (review_status in ('submitted', 'approved', 'rejected')),
  author_id uuid references auth.users(id) on delete set null,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists new_workup_submissions_status_idx
on public.new_workup_submissions(review_status, created_at desc);

alter table public.new_workup_submissions enable row level security;

drop policy if exists "authors can submit new workup drafts" on public.new_workup_submissions;
create policy "authors can submit new workup drafts"
on public.new_workup_submissions
for insert
to authenticated
with check (
  author_id = auth.uid()
  and review_status = 'submitted'
);

drop policy if exists "authors can read own new workup submissions" on public.new_workup_submissions;
create policy "authors can read own new workup submissions"
on public.new_workup_submissions
for select
to authenticated
using (
  author_id = auth.uid()
  or public.can_review_workup_content()
);

drop policy if exists "reviewers can update new workup submissions" on public.new_workup_submissions;
create policy "reviewers can update new workup submissions"
on public.new_workup_submissions
for update
to authenticated
using (public.can_review_workup_content())
with check (public.can_review_workup_content());
