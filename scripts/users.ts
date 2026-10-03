// Lists accounts waiting for approval, and approves them. New GitHub sign-ins start pending:
// they can browse but not upload or annotate until approved here.
//
//   npm run db:users                       list pending accounts (local database, from .env)
//   npm run db:users -- approve <who>      approve one: a GitHub login, an email or a user id
//   npm run prod:users [-- approve <who>]  the same against production, from .env.prod

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const USER_AGENT = "a-thousand-words-users/1.0 (https://github.com/lukeberrycode/a-thousand-words)";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Missing environment variable DATABASE_URL. See .env.example.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

/** GitHub's public API, unauthenticated: 60 requests an hour, plenty for this. */
async function github(path: string): Promise<{ id: number; login: string } | null> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

/** The GitHub login for a user, from the numeric account id Auth.js stored, or "?" if unknown. */
async function loginFor(userId: string) {
  const account = await db.account.findFirst({ where: { userId, provider: "github" } });
  if (!account) return "?";
  return (await github(`/user/${account.providerAccountId}`).catch(() => null))?.login ?? "?";
}

async function list() {
  const pending = await db.user.findMany({ where: { approvedAt: null }, orderBy: { createdAt: "asc" } });
  if (pending.length === 0) {
    console.log("No accounts waiting for approval.");
    return;
  }
  console.log(`${pending.length} waiting for approval:\n`);
  for (const user of pending) {
    const login = await loginFor(user.id);
    console.log(`  ${login.padEnd(20)} ${user.name ?? "(no name)"} <${user.email ?? "no email"}>`);
    console.log(`  ${"".padEnd(20)} signed up ${user.createdAt.toISOString().slice(0, 10)}, id ${user.id}`);
    if (login !== "?") console.log(`  ${"".padEnd(20)} https://github.com/${login}`);
    console.log();
  }
  console.log("Approve one with: approve <github-login | email | id>");
}

/** Find a user by id, email or GitHub login, in that order. */
async function find(who: string) {
  const byIdOrEmail = await db.user.findFirst({ where: { OR: [{ id: who }, { email: who }] } });
  if (byIdOrEmail) return byIdOrEmail;
  const profile = await github(`/users/${encodeURIComponent(who)}`);
  if (!profile) return null;
  const account = await db.account.findUnique({
    where: { provider_providerAccountId: { provider: "github", providerAccountId: String(profile.id) } },
    include: { user: true },
  });
  return account?.user ?? null;
}

async function approve(who: string | undefined) {
  if (!who) throw new Error("Say who to approve: approve <github-login | email | id>");
  const user = await find(who);
  if (!user) {
    console.log(`No account found for "${who}". They need to sign in to the site once first.`);
    process.exitCode = 1;
    return;
  }
  const label = `${user.name ?? "(no name)"} <${user.email ?? "no email"}>`;
  if (user.approvedAt) {
    console.log(`${label} was already approved on ${user.approvedAt.toISOString().slice(0, 10)}.`);
    return;
  }
  await db.user.update({ where: { id: user.id }, data: { approvedAt: new Date() } });
  console.log(`Approved ${label}. They can upload and annotate from their next page load.`);
}

async function main() {
  console.log(`Database: ${new URL(databaseUrl!).host}\n`);
  const [command, arg] = process.argv.slice(2);
  if (!command || command === "list") return list();
  if (command === "approve") return approve(arg);
  throw new Error(`Unknown command "${command}". Use: list, or approve <who>.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
