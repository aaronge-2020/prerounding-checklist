import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadSupabaseEnvFiles } from "../utils/supabase/env.js";
import { createSupabaseServiceClient } from "../utils/supabase/node.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadSupabaseEnvFiles({ cwd: repoRoot });

function usage() {
  return [
    "Usage:",
    "  npm run grant:workup-access -- --email=user@example.com --workup=workup_id",
    "  npm run grant:workup-access -- --email=reviewer@example.com --role=reviewer",
    "",
    "Options:",
    "  --email=EMAIL                 Existing Supabase Auth user to grant.",
    "  --workup=WORKUP_ID            Workup ID for delegated author access.",
    "  --role=author|reviewer|admin  Default: author. reviewer/admin grant global approval rights.",
    "  --display-name=NAME           Optional Workup Studio display name.",
    "  --assigned-by=EMAIL           Optional existing reviewer/admin email for audit metadata."
  ].join("\n");
}

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : fallback;
}

async function findUserByEmail(supabase, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Unable to list Supabase Auth users: ${error.message}`);
    const users = Array.isArray(data?.users) ? data.users : [];
    const user = users.find((candidate) => String(candidate.email || "").trim().toLowerCase() === normalizedEmail);
    if (user) return user;
    if (users.length < perPage) return null;
  }
  throw new Error("Stopped after scanning 50,000 auth users. Narrow this helper before using it on a larger project.");
}

async function assertWorkupExists(supabase, workupId) {
  const { data, error } = await supabase
    .from("workups")
    .select("id,title")
    .eq("id", workupId)
    .maybeSingle();
  if (error) throw new Error(`Unable to verify workup ${workupId}: ${error.message}`);
  if (!data) throw new Error(`Workup ${workupId} was not found. Run npm run import:medical-knowledge first, or check the ID.`);
  return data;
}

async function main() {
  const email = argValue("--email");
  const workupId = argValue("--workup");
  const role = argValue("--role", workupId ? "author" : "reviewer");
  const displayName = argValue("--display-name");
  const assignedByEmail = argValue("--assigned-by");

  if (!email || !["author", "reviewer", "admin"].includes(role)) {
    throw new Error(usage());
  }
  if (role === "author" && !workupId) {
    throw new Error(`Author delegation requires --workup.\n\n${usage()}`);
  }

  const supabase = createSupabaseServiceClient();
  const user = await findUserByEmail(supabase, email);
  if (!user) {
    throw new Error(`No Supabase Auth user found for ${email}. Invite/create the user in Supabase Auth first, then rerun this command.`);
  }

  let assignedBy = null;
  if (assignedByEmail) {
    const reviewer = await findUserByEmail(supabase, assignedByEmail);
    if (!reviewer) throw new Error(`No Supabase Auth user found for --assigned-by=${assignedByEmail}.`);
    assignedBy = reviewer.id;
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("workup_author_profiles")
    .select("role,display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingProfileError) throw new Error(`Unable to read existing author profile: ${existingProfileError.message}`);
  const profileRole = role === "author" && ["reviewer", "admin"].includes(existingProfile?.role)
    ? existingProfile.role
    : role;

  const { error: profileError } = await supabase
    .from("workup_author_profiles")
    .upsert({
      user_id: user.id,
      role: profileRole,
      display_name: displayName || existingProfile?.display_name || user.user_metadata?.full_name || user.email
    }, { onConflict: "user_id" });
  if (profileError) throw new Error(`Unable to grant ${profileRole} profile: ${profileError.message}`);

  if (workupId) {
    const workup = await assertWorkupExists(supabase, workupId);
    const { error: assignmentError } = await supabase
      .from("workup_author_assignments")
      .upsert({
        user_id: user.id,
        workup_id: workupId,
        role: "author",
        assigned_by: assignedBy
      }, { onConflict: "user_id,workup_id" });
    if (assignmentError) throw new Error(`Unable to assign ${workupId}: ${assignmentError.message}`);
    console.log(`Granted ${email} author access to ${workup.id}: ${workup.title}`);
  } else {
    console.log(`Granted ${email} ${role} access in Workup Studio.`);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
