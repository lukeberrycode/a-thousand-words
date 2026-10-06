import type { Page } from "@playwright/test";
import { ImagePage } from "./support/image-page";
import { newSeed, picture, type Picture } from "./support/pictures";
import { deleteObject, objectExists, sql } from "./support/services";
import { expect, test } from "./support/world";

// Uploads go from the browser straight to the R2 bucket in .env, as in development.

/** Fill in and submit the upload form. Returns the R2 key the file was uploaded to, once it has been. */
async function upload(page: Page, file: Picture, title: string) {
  await page.goto("/upload");
  const put = page.waitForRequest((req) => req.method() === "PUT");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("I have the right to share this image publicly.").check();
  await page.getByRole("button", { name: "Upload" }).click();
  const key = decodeURIComponent(new URL((await put).url()).pathname).replace(/^\/[^/]+\//, "");
  return key;
}

const imagesOf = (userId: string) =>
  sql<{ id: string; title: string; ownerId: string; sha256: string | null; phash: string | null }>(
    `SELECT id, title, "ownerId", sha256, phash::text FROM "Image" WHERE "ownerId" = $1`,
    [userId],
  );

test("UPL-01, UPL-02: Upload an image while signed in; it belongs to the uploader", async ({ page, world }) => {
  const user = await world.user();
  await world.signIn(page.context(), user);
  const title = `Upload ${user.id.slice(-6)}`;

  await upload(page, await picture(newSeed(), { format: "jpeg" }), title);

  await expect(page).toHaveURL(/\/images\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const view = new ImagePage(page, { id, title, storageKey: "", width: 1200, height: 800 });
  await expect(view.picture).toBeVisible();
  await expect(view.panel.getByRole("heading", { name: title })).toBeVisible();
  await view.openAbout();
  await expect(view.panel.getByText(`Uploaded by ${user.name}`)).toBeVisible();

  // UPL-02: the row's owner comes from the session.
  const rows = await imagesOf(user.id);
  expect(rows.map((r) => r.id)).toEqual([id]);
});

test("UPL-03: Duplicate warning", async ({ page, world }) => {
  const owner = await world.user();
  const seed = newSeed();
  const existing = await world.image(owner, { seed });
  const user = await world.user();
  await world.signIn(page.context(), user);
  const title = `Look-alike ${user.id.slice(-6)}`;
  const lookAlike = await picture(seed, { width: 900, height: 600, format: "webp" });

  // Step 1: a look-alike at another size and format.
  const firstKey = await upload(page, lookAlike, title);
  const warning = page.getByRole("main").getByRole("alert");
  await expect(warning.getByText("This looks like an image that's already here.")).toBeVisible();
  await expect(warning.getByText(existing.title)).toBeVisible();
  await expect(warning.getByText("0 annotations")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  // Step 2: Cancel clears the warning and leaves nothing behind.
  const secondKey = await upload(page, lookAlike, title);
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Cancel" }).click();
  await expect(warning).toBeHidden();
  await expect(page.getByRole("button", { name: "Upload" })).toBeEnabled();
  await expect(page.getByLabel("Title")).toBeEnabled();
  await expect.poll(() => objectExists(secondKey)).toBe(false);

  // The very same file is called out as exact.
  const exactKey = await upload(page, await picture(seed), title);
  await expect(warning.getByText("This exact image is already here.")).toBeVisible();
  await warning.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => objectExists(exactKey)).toBe(false);

  // Step 3: Go to it opens the existing image, and removes the upload.
  const thirdKey = await upload(page, lookAlike, title);
  await warning.getByRole("button", { name: "Go to it" }).click();
  await expect(page).toHaveURL(`/images/${existing.id}`);
  await expect.poll(() => objectExists(thirdKey)).toBe(false);

  expect(await imagesOf(user.id)).toEqual([]);
  // The upload left from step 1, where the test moved on without choosing, is the orphan case in
  // docs/architecture.md; remove it here.
  await deleteObject(firstKey);
});

test("UPL-04: Upload anyway", async ({ page, world }) => {
  const owner = await world.user();
  const seed = newSeed();
  await world.image(owner, { seed });
  const user = await world.user();
  await world.signIn(page.context(), user);

  await upload(page, await picture(seed, { width: 900, height: 600, format: "webp" }), "Upload anyway");
  await page.getByRole("main").getByRole("alert").getByRole("button", { name: "Upload anyway" }).click();

  await expect(page).toHaveURL(/\/images\/[^/]+$/);
  const rows = await imagesOf(user.id);
  expect(rows).toHaveLength(1);
  expect(page.url()).toContain(rows[0].id);
  expect(rows[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(rows[0].phash).not.toBeNull();
});

test("UPL-05: Different images aren't flagged", async ({ page, world }) => {
  const owner = await world.user();
  await world.image(owner);
  const user = await world.user();
  await world.signIn(page.context(), user);

  await upload(page, await picture(newSeed()), "A new picture");

  await expect(page).toHaveURL(/\/images\/[^/]+$/);
  expect(await imagesOf(user.id)).toHaveLength(1);
});
