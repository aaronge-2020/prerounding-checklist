create index if not exists workups_public_catalog_status_title_idx
on public.workups(status, title);

create index if not exists workup_sections_public_catalog_order_idx
on public.workup_sections(workup_id, sort_order);

create index if not exists workup_sections_source_ids_gin_idx
on public.workup_sections using gin(source_ids);

drop policy if exists "public can read reviewed sources" on public.sources;
create policy "public can read reviewed sources"
on public.sources
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.workups workup
    where workup.status in ('mvp', 'active', 'published', 'reviewed')
      and (
        public.sources.id = any(workup.source_ids)
        or public.sources.source_id = any(workup.source_ids)
      )
  )
  or exists (
    select 1
    from public.workup_sections section
    join public.workups workup on workup.id = section.workup_id
    where workup.status in ('mvp', 'active', 'published', 'reviewed')
      and (
        public.sources.id = any(section.source_ids)
        or public.sources.source_id = any(section.source_ids)
      )
  )
);

drop policy if exists "public can read reviewed workups" on public.workups;
create policy "public can read reviewed workups"
on public.workups
for select
to anon, authenticated
using (status in ('mvp', 'active', 'published', 'reviewed'));

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
      and workup.status in ('mvp', 'active', 'published', 'reviewed')
  )
);
