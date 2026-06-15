drop policy if exists "public can read reviewed sources" on public.sources;
create policy "public can read reviewed sources"
on public.sources
for select
to anon, authenticated
using (true);

drop policy if exists "public can read reviewed workups" on public.workups;
create policy "public can read reviewed workups"
on public.workups
for select
to anon, authenticated
using (true);

drop policy if exists "public can read reviewed workup sections" on public.workup_sections;
create policy "public can read reviewed workup sections"
on public.workup_sections
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.workups workup
    where workup.id = public.workup_sections.workup_id
  )
);
