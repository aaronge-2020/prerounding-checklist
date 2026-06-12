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

For a one-command hosted deployment, also set:

```powershell
$env:SUPABASE_ACCESS_TOKEN="your-supabase-cli-access-token"
$env:SUPABASE_DB_PASSWORD="your-hosted-postgres-password"
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
$env:SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="your-google-oauth-client-secret"
$env:WORKUP_STUDIO_REVIEWER_EMAIL="reviewer@example.com"
```

## Create The Backend

First check whether this machine has the credentials needed to deploy and seed the hosted Supabase project:

```bash
npm run check:supabase-auth
```

That command also probes the live project for Google OAuth readiness and the Workup Studio tables, so `Unsupported provider` or `table not found` failures show up before a maintainer opens the app.

The simplest deployment path is:

```bash
npm run deploy:supabase-workup-authoring -- --reviewer-email=reviewer@example.com
```

It pushes `supabase/config.toml` so Google OAuth and the deployed redirect URLs are configured, pushes the migrations, imports the current JSON workups into Supabase, optionally grants reviewer access, then reruns `npm run check:supabase-auth`.

The same path is available in GitHub Actions through `.github/workflows/supabase-workup-authoring.yml`. Add these repository secrets, then run the `Supabase Workup Authoring Deploy` workflow manually:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`

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

Enable Google in Supabase Auth first:

1. In Supabase, open `Authentication -> Providers -> Google`.
2. Enable Google and add the Google OAuth client ID/secret.
3. Add the deployed app URL to the Supabase Auth redirect allow-list, for example `https://aaronge-2020.github.io/prerounding-checklist/`.

The deploy command can push the Google provider config from `supabase/config.toml` when `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` are set. If you configure it manually in the dashboard, keep the callback URL `https://aaronge-2020.github.io/prerounding-checklist/?workupStudioOAuth=1` allow-listed.

After the reviewer signs in once with Google, grant that Supabase Auth user reviewer access:

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

Use Supabase Google OAuth for the collaborator account. The app does not ask users for a username/password. If Google is not enabled in Supabase Auth, Supabase returns `Unsupported provider: provider is not enabled`; enable the provider and redirect URL before delegating users.

After the user signs in once and exists in `auth.users`, assign one workup:

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
2. The backend is fixed to the configured Workup Studio Supabase project.
3. Continue with Google. Supabase handles authentication; Workup Studio only checks whether that authenticated user has an author assignment or reviewer/admin profile.
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
