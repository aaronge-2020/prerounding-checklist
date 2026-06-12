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

First check whether this machine has the credentials needed to deploy and seed the hosted Supabase project:

```bash
npm run check:supabase-auth
```

Link the Supabase project, then push the migration:

```bash
npx supabase link --project-ref hajjuzpnlvpetsleuxwb
npx supabase db push
```

The migration creates:

- `workup_author_profiles`
- `workup_author_assignments`
- `sources`
- `workups`
- `workup_sections`
- `workup_items`
- `pathway_trees`
- `pathway_nodes`
- `review_cases`
- `change_sets`

RLS allows assigned authors to draft change sets for delegated workups, while reviewers/admins can approve and maintain canonical authoring tables.
Delegated authors are scoped through `workup_author_assignments`; reviewers/admins can grant one user access to one workup without giving them global approval rights.

## Seed Existing JSON

After the migration is live and `SUPABASE_SERVICE_ROLE_KEY` is set:

```bash
npm run import:medical-knowledge
```

Without the service role key, the same command safely falls back to a local snapshot dry run.

## Grant Reviewer Access

Create or invite the reviewer in Supabase Auth, then run:

```bash
npm run grant:workup-access -- --email=reviewer@example.com --role=reviewer
```

Equivalent SQL for Supabase SQL Editor:

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
Workup Studio keeps publish controls locked until a signed-in account has a `reviewer` or `admin` profile.

## Delegate One Workup

Use Supabase Auth for the collaborator account. Email/password is the supported in-app path for this static build. OAuth is intentionally not exposed in the app until a provider is enabled in Supabase Auth and the app URL is added to the redirect allow-list; otherwise Supabase returns `Unsupported provider: provider is not enabled`.

After the user exists in `auth.users`, assign one workup:

```bash
npm run grant:workup-access -- --email=assigned-author@example.com --workup=pediatric_urinary_uti_pyelonephritis_v1 --assigned-by=reviewer@example.com
```

Equivalent SQL for Supabase SQL Editor:

```sql
insert into public.workup_author_assignments (user_id, workup_id, role, assigned_by)
select target.id,
       'pediatric_urinary_uti_pyelonephritis_v1',
       'author',
       reviewer.id
from auth.users target
cross join auth.users reviewer
where target.email = 'assigned-author@example.com'
  and reviewer.email = 'reviewer@example.com'
on conflict (user_id, workup_id) do update
set role = excluded.role,
    assigned_by = excluded.assigned_by;
```

That user can draft only the assigned workup. A reviewer/admin still has to publish; the app does not support local-only approval as a substitute for reviewer auth.

## Use Workup Studio

1. Open the app and choose `Workup Studio`.
2. The backend is fixed to the configured Workup Studio Supabase project; users only enter their assigned account credentials.
3. Sign in with Supabase Auth by email/password.
4. Pick a workup and section.
5. Copy the generated OpenEvidence prompt and paste it into OpenEvidence.
6. Paste the reviewed JSON result back into Workup Studio.
7. Preview the result. Only the selected section is accepted.
8. Save a draft or, as a reviewer/admin, use `Save + publish`.
9. Export reviewed content back to release JSON:

```bash
npm run export:medical-knowledge
```

The export writes the existing `medical-knowledge/complaint-modules/*.json` shape used by `medical-knowledge-db.js`.
`Save + publish` updates Supabase `change_sets` plus the normalized authoring tables for database-backed users. The static app release still needs the export/build/deploy path before bundled JSON users see the new content.

## Next.js Note

The snippets from Supabase that use `page.tsx`, `utils/supabase/server.ts`, and middleware are for a Next.js app. This repository is currently a static HTML app, so those files would not run here. If the app is later moved to Next.js, keep the same environment variable names and use `@supabase/ssr` for server/client helpers at that point.
