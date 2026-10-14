import { expectRegion, ImagePage } from "./support/image-page";
import { objectExists, sql } from "./support/services";
import { expect, test } from "./support/world";

// Reading and managing (docs/system-tests.md).

const OPEN_STROKE = /stroke:\s*#facc15;\s*stroke-width:\s*3/;
const RECEDED = /stroke-opacity:\s*0\.45/;

test("MAN-02: Only your own content shows Edit and Delete", async ({ page, world }) => {
  const me = await world.user();
  const them = await world.user({ name: "Other" });
  const mine = await world.image(me);
  const theirs = await world.image(them);
  await world.region(mine, me, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, "My note");
  await world.region(mine, them, { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, "Their note");
  await world.signIn(page.context(), me);

  const view = new ImagePage(page, mine);
  await view.goto();
  await view.pickFromList("My note");
  await expect(view.card.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(view.card.getByRole("button", { name: "Delete" })).toBeVisible();
  await view.closeCard();
  await view.pickFromList("Their note");
  await expect(view.card.getByText("Their note")).toBeVisible();
  await expect(view.card.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await expect(view.card.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await view.closeCard();

  await view.openAbout();
  await expect(view.panel.getByRole("button", { name: "Edit details" })).toBeVisible();
  await expect(view.panel.getByRole("button", { name: "Delete image" })).toBeVisible();

  const other = new ImagePage(page, theirs);
  await other.goto();
  await other.openAbout();
  await expect(other.panel.getByText(`Uploaded by ${them.name}`)).toBeVisible();
  await expect(other.panel.getByRole("button", { name: "Edit details" })).toHaveCount(0);
  await expect(other.panel.getByRole("button", { name: "Delete image" })).toHaveCount(0);
});

test("MAN-03: Edit an annotation's box and text", async ({ page, world }) => {
  const me = await world.user();
  const image = await world.image(me);
  const saved = { x: 0.3, y: 0.3, w: 0.15, h: 0.15 };
  const regionId = await world.region(image, me, saved, "Old text");
  await world.signIn(page.context(), me);
  const view = new ImagePage(page, image);
  await view.goto();

  // Step 1.
  await view.pickFromList("Old text");
  await view.card.getByRole("button", { name: "Edit" }).click();
  await expect(view.draft.locator(".a9s-corner-handle-topleft")).toBeVisible();
  await expect(view.card.getByText("Drag the box or its corners to adjust it.")).toBeVisible();
  await expect(view.card.getByLabel("Edit annotation")).toHaveValue("Old text");

  // Step 2: drag the box up and left by a third of its size.
  const before = await view.draft.locator(".a9s-shape-handle").boundingBox();
  const centre = { x: before!.x + before!.width / 2, y: before!.y + before!.height / 2 };
  await view.dragOnScreen(centre, { x: centre.x - before!.width / 3, y: centre.y - before!.height / 3 });
  await view.card.getByLabel("Edit annotation").fill("New text");
  await view.card.getByRole("button", { name: "Save" }).click();
  await expect(view.card.getByText("New text")).toBeVisible();
  await expect(view.card.getByText("· edited")).toBeVisible();
  await page.waitForTimeout(500);
  await expect(view.card.getByText("Old text")).toHaveCount(0);

  const [moved] = await sql<{ x: number; y: number; w: number; h: number }>(
    `SELECT x, y, w, h FROM "Region" WHERE id = $1`,
    [regionId],
  );
  expectRegion(moved, { x: saved.x - saved.w / 3, y: saved.y - saved.h / 3, w: saved.w, h: saved.h }, 0.01);
  expectRegion(await view.shapeRegion(regionId), moved, 0.003);
  const [annotation] = await sql<{ bodyMarkdown: string }>(`SELECT "bodyMarkdown" FROM "Annotation" WHERE "regionId" = $1`, [
    regionId,
  ]);
  expect(annotation.bodyMarkdown).toBe("New text");

  // Step 3: an unsaved move is undone by Cancel.
  await view.card.getByRole("button", { name: "Edit" }).click();
  const box = await view.draft.locator(".a9s-shape-handle").boundingBox();
  const mid = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await view.dragOnScreen(mid, { x: mid.x + box!.width / 3, y: mid.y + box!.height / 4 });
  await view.card.getByRole("button", { name: "Cancel" }).click();
  await expect(view.draft).toHaveCount(0);
  expectRegion(await view.shapeRegion(regionId), moved, 0.003);
});

test("MAN-04: Delete an annotation", async ({ page, world }) => {
  const me = await world.user();
  const them = await world.user({ name: "Other" });
  const image = await world.image(me);
  const alone = await world.region(image, me, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, "Mine alone");
  const shared = await world.region(image, them, { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, "Theirs");
  await world.addAnnotation(shared, me, "Mine on theirs");
  await world.signIn(page.context(), me);
  const view = new ImagePage(page, image);
  await view.goto();

  // Step 1: Keep changes nothing.
  await view.pickFromList("Mine alone");
  await view.card.getByRole("button", { name: "Delete" }).click();
  await expect(view.card.getByText("Delete this annotation?")).toBeVisible();
  await view.card.getByRole("button", { name: "Keep" }).click();
  await expect(view.card.getByRole("button", { name: "Edit" })).toBeVisible();

  // Step 2: the box's only annotation goes, and the box with it.
  await view.card.getByRole("button", { name: "Delete" }).click();
  await view.card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(view.card).toBeHidden();
  await expect(view.shape(alone)).toHaveCount(0);
  await expect(view.panel.getByRole("button", { name: "1 annotation" })).toBeVisible();
  expect(await sql(`SELECT 1 FROM "Region" WHERE id = $1`, [alone])).toHaveLength(0);
  expect(await sql(`SELECT 1 FROM "Annotation" WHERE "regionId" = $1`, [alone])).toHaveLength(0);

  // On a box with someone else's annotation, the box stays with theirs.
  await view.pickFromList("Theirs +1");
  await view.card.getByRole("button", { name: "Delete" }).click();
  await view.card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(view.card.getByText("Mine on theirs")).toHaveCount(0);
  await expect(view.card.getByText("Theirs")).toBeVisible();
  await expect(view.shape(shared)).toHaveCount(1);
  const left = await sql<{ authorId: string }>(`SELECT "authorId" FROM "Annotation" WHERE "regionId" = $1`, [shared]);
  expect(left.map((a) => a.authorId)).toEqual([them.id]);
});

test("MAN-05: Edit and delete your own image", async ({ page, world }) => {
  const me = await world.user();
  const them = await world.user({ name: "Other" });
  const image = await world.image(me, { description: "Old description" });
  await world.region(image, them, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, "Their note");
  await world.signIn(page.context(), me);
  const view = new ImagePage(page, image);
  await view.goto();

  // Step 1.
  const title = `Renamed ${image.id.slice(-6)}`;
  await view.openAbout();
  await view.panel.getByRole("button", { name: "Edit details" }).click();
  await view.panel.getByLabel("Title").fill(title);
  await view.panel.getByLabel("Description").fill("New description");
  await view.panel.getByRole("button", { name: "Save" }).click();
  await expect(view.panel.getByRole("heading", { name: title })).toBeVisible();
  await expect(view.panel.getByText("New description")).toBeVisible();
  await expect(page).toHaveTitle(`${title} · A Thousand Words`);

  // Step 2.
  await view.panel.getByRole("button", { name: "Delete image" }).click();
  await expect(
    view.panel.getByText(
      "Delete this image and its annotation, including any written by other people? This can't be undone.",
    ),
  ).toBeVisible();
  await view.panel.getByRole("button", { name: "Delete image" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Recently added" })).toBeVisible();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  // Step 3.
  expect(await sql(`SELECT 1 FROM "Image" WHERE id = $1`, [image.id])).toHaveLength(0);
  expect(await sql(`SELECT 1 FROM "Region" WHERE "imageId" = $1`, [image.id])).toHaveLength(0);
  expect(await sql(`SELECT 1 FROM "Annotation" WHERE "authorId" = $1`, [them.id])).toHaveLength(0);
  await expect.poll(() => objectExists(image.storageKey)).toBe(false);
});

test("MAN-06: The server refuses changes to other people's content", async ({ page, world }) => {
  const me = await world.user();
  const them = await world.user({ name: "Other" });
  const image = await world.image(me);
  const regionId = await world.region(image, me, { x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, "Mine for now");
  await world.signIn(page.context(), me);
  const view = new ImagePage(page, image);
  await view.goto();

  await view.pickFromList("Mine for now");
  await view.card.getByRole("button", { name: "Edit" }).click();
  await sql(`UPDATE "Annotation" SET "authorId" = $1 WHERE "regionId" = $2`, [them.id, regionId]);
  await view.card.getByLabel("Edit annotation").fill("Changed");
  await view.card.getByRole("button", { name: "Save" }).click();

  await expect(view.card.getByRole("alert")).toHaveText("That annotation doesn't exist, or isn't yours.");
  const [annotation] = await sql<{ bodyMarkdown: string }>(`SELECT "bodyMarkdown" FROM "Annotation" WHERE "regionId" = $1`, [
    regionId,
  ]);
  expect(annotation.bodyMarkdown).toBe("Mine for now");
});

test("MAN-08: Click to read; the open box stands out", async ({ page, world }) => {
  const author = await world.user();
  const image = await world.image(author);
  const first = { x: 0.1, y: 0.1, w: 0.15, h: 0.15 };
  const a = await world.region(image, author, first, "First box");
  const b = await world.region(image, author, { x: 0.4, y: 0.2, w: 0.15, h: 0.2 }, "Second box");
  const c = await world.region(image, author, { x: 0.2, y: 0.6, w: 0.2, h: 0.2 }, "Third box");
  const view = new ImagePage(page, image);
  await view.goto();

  // Step 1: hovering opens nothing.
  const centre = await view.point(first.x + first.w / 2, first.y + first.h / 2);
  await page.mouse.move(centre.x, centre.y);
  await page.waitForTimeout(500);
  await expect(view.card).toBeHidden();

  // Step 2.
  const fit = await view.imageBox();
  await page.mouse.click(centre.x, centre.y);
  await expect(view.card.getByText("First box")).toBeVisible();
  await expect(view.panel).toBeHidden();
  expect((await view.imageBox()).width).toBeGreaterThan(fit.width);
  await expect(view.shape(a)).toHaveAttribute("style", OPEN_STROKE);
  await expect(view.shape(b)).toHaveAttribute("style", RECEDED);
  await expect(view.shape(c)).toHaveAttribute("style", RECEDED);

  // Step 3: a click on empty image closes the card and leaves the view where it is.
  const zoomed = await view.imageBox();
  const spot = await view.freeSpot({ w: 10, h: 10 });
  await page.mouse.click(spot.x + 5, spot.y + 5);
  await expect(view.card).toBeHidden();
  await expect(view.panel).toBeVisible();
  expect(await view.imageBox()).toEqual(zoomed);

  // Step 4.
  await view.pickFromList("Third box");
  await expect(view.card.getByText("Third box")).toBeVisible();
  await expect(view.shape(c)).toHaveAttribute("style", OPEN_STROKE);
  await expect(view.shape(a)).toHaveAttribute("style", RECEDED);
});
