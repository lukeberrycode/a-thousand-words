import { sql } from "./support/services";
import { expect, test } from "./support/world";

// Sign-in (docs/system-tests.md). The GitHub OAuth flow itself (AUTH-02, AUTH-03, AUTH-05) needs a
// real GitHub account and stays manual; these tests sign in with a session made by the test.

test("AUTH-01: Signed-out header", async ({ page }) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Upload" })).toHaveCount(0);
});

test("AUTH-04: Sign out ends the session (steps 1 and 2)", async ({ page, world }) => {
  const user = await world.user();
  const token = await world.signIn(page.context(), user);
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByText(user.name)).toBeVisible();

  await header.getByRole("button", { name: "Sign out" }).click();

  await expect(header.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
  await expect(page).toHaveURL("/");
  expect(await sql(`SELECT 1 FROM "Session" WHERE "sessionToken" = $1`, [token])).toHaveLength(0);
  expect(await sql(`SELECT 1 FROM "User" WHERE id = $1`, [user.id])).toHaveLength(1);
});
