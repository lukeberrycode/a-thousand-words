import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ImagePage } from "./support/image-page";
import { newSeed, picture } from "./support/pictures";
import { sql } from "./support/services";
import { expect, test } from "./support/world";

const PENDING = "Your account is waiting for approval. You can upload and annotate once it's approved.";

test("SEC-01: Upload page asks signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/upload");
  const main = page.getByRole("main");
  await expect(main.getByText("You need an account to upload images.")).toBeVisible();
  await expect(main.locator('input[type="file"]')).toHaveCount(0);

  // Step 2 goes on to GitHub, which needs a real account: check the app sends the visitor there,
  // set to come back to /upload.
  await page.route("https://github.com/**", (route) => route.abort());
  const toGitHub = page.waitForRequest((req) => req.url().startsWith("https://github.com/login/oauth/authorize"));
  await main.getByRole("button", { name: "Sign in with GitHub" }).click();
  const request = await toGitHub;
  expect(new URL(request.url()).searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/callback/github");
  const cookies = await page.context().cookies();
  const callback = cookies.find((c) => c.name === "authjs.callback-url");
  expect(decodeURIComponent(callback?.value ?? "")).toBe("http://localhost:3000/upload");
});

test("SEC-02: Upload actions reject requests that aren't signed in", async ({ page, world }) => {
  const user = await world.user();
  await world.signIn(page.context(), user);
  await page.goto("/upload");
  await expect(page.getByLabel("Title")).toBeVisible();

  // Sign out in a second tab; the first still shows the form.
  const other = await page.context().newPage();
  await other.goto("/");
  await other.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await expect(other.getByRole("banner").getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();

  const puts: string[] = [];
  page.on("request", (req) => req.method() === "PUT" && puts.push(req.url()));
  await page.locator('input[type="file"]').setInputFiles(await picture(newSeed()));
  await page.getByLabel("Title").fill("Should not upload");
  await page.getByLabel("I have the right to share this image publicly.").check();
  await page.getByRole("button", { name: "Upload" }).click();

  await expect(page.getByRole("status")).toHaveText("Sign in to upload images.");
  expect(puts).toEqual([]);
  expect(await sql(`SELECT 1 FROM "Image" WHERE "ownerId" = $1`, [user.id])).toHaveLength(0);
});

test("SEC-03: A pending account can browse but not contribute", async ({ page, world }) => {
  const owner = await world.user();
  const image = await world.image(owner);
  await world.region(image, owner, { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, "An existing annotation");
  const pending = await world.user({ approved: false });
  await world.signIn(page.context(), pending);

  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByText("Awaiting approval")).toBeVisible();
  await expect(header.getByRole("link", { name: "Upload" })).toHaveCount(0);

  await page.goto("/upload");
  await expect(page.getByRole("main").getByText(PENDING)).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  const view = new ImagePage(page, image);
  await view.goto();
  await expect(view.panel.getByText(PENDING)).toBeVisible();
  await expect(view.panel.getByRole("button", { name: "Annotate" })).toHaveCount(0);
  await view.pickFromList("An existing annotation");
  await expect(view.card.getByText("An existing annotation")).toBeVisible();
});

test("SEC-04: Approve a pending account", async ({ page, world }) => {
  const pending = await world.user({ approved: false });
  await world.signIn(page.context(), pending);
  await page.goto("/");
  await expect(page.getByRole("banner").getByText("Awaiting approval")).toBeVisible();

  // The script finds accounts by GitHub login, email or id. Test users have no GitHub account, so
  // this uses the email; finding by login is covered by the manual run.
  const listed = await users();
  expect(listed.stdout).toContain(pending.name);
  expect(listed.stdout).toContain(pending.email);
  expect(listed.stdout).toContain(`signed up ${new Date().toISOString().slice(0, 10)}`);

  const approved = await users("approve", pending.email);
  expect(approved.stdout).toContain(`Approved ${pending.name}`);

  await page.reload();
  await expect(page.getByRole("banner").getByRole("link", { name: "Upload" })).toBeVisible();

  const again = await users("approve", pending.email);
  expect(again.stdout).toContain("was already approved");

  const nobody = await users("approve", `nobody-${pending.id.slice(-12)}`);
  expect(nobody.stdout).toContain("No account found");
  expect(nobody.code).toBe(1);
});

/** Run `npm run db:users` with these arguments. */
async function users(...args: string[]) {
  try {
    const { stdout } = await promisify(execFile)("npx", ["tsx", "scripts/users.ts", ...args]);
    return { stdout, code: 0 };
  } catch (err) {
    const { stdout, code } = err as { stdout: string; code: number };
    return { stdout, code };
  }
}
