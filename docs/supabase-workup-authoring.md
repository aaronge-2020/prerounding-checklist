# Supabase Workup Authoring Setup

Workup Studio stores reviewed clinical knowledge and draft change sets in Supabase. Patient vault data stays local-only and must not be sent to these tables.

## Local Config

`.env.local` is intentionally ignored by git. This workspace has the public Supabase values needed by the browser-side Workup Studio panel:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://hajjuzpnlvpetsleuxwb.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

For import/export commands, set a service role key only in your local shell or ignored env file:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Do not paste the service role key into Workup Studio.

## Create The Backend

Link the Supabase project, then push the migration:

```bash
npx supabase link --project-ref hajjuzpnlvpetsleuxwb
npx supabase db push
```

The migration creates:

- `workup_author_profiles`
- `sources`
- `workups`
- `workup_sections`
- `workup_items`
- `pathway_trees`
- `pathway_nodes`
- `review_cases`
- `change_sets`

RLS allows authenticated users to draft change sets, while reviewers/admins can approve and maintain canonical authoring tables.

## Seed Existing JSON

After the migration is live and `SUPABASE_SERVICE_ROLE_KEY` is set:

```bash
npm run import:medical-knowledge
```

Without the service role key, the same command safely falls back to a local snapshot dry run.

## Grant Reviewer Access

Create or invite the reviewer in Supabase Auth, then run this SQL in Supabase SQL Editor:

```sql
insert into public.workup_author_profiles (user_id, role, display_name)
select id, 'reviewer', email
from auth.users
where email = 'reviewer@example.com'
on conflict (user_id) do update
set role = excluded.role,
    display_name = excluded.display_name;
```

Authors can save drafts. Reviewers or admins can approve drafts and mark them export-ready.

## Use Workup Studio

1. Open the app and choose `Workup Studio`.
2. The backend panel is prefilled with the project URL and public publishable key.
3. Sign in with a Supabase Auth email/password user.
4. Edit one section at a time: pathway tree, history, exam, safety checks, tests, red flags, management, sources, or review cases.
5. Save the section draft. Only that section is written to `change_sets`.
6. Review and approve the draft when ready.
7. Export reviewed content back to release JSON:

```bash
npm run export:medical-knowledge
```

The export writes the existing `medical-knowledge/complaint-modules/*.json` shape used by `medical-knowledge-db.js`.

## Next.js Note

The snippets from Supabase that use `page.tsx`, `utils/supabase/server.ts`, and middleware are for a Next.js app. This repository is currently a static HTML app, so those files would not run here. If the app is later moved to Next.js, keep the same environment variable names and use `@supabase/ssr` for server/client helpers at that point.
