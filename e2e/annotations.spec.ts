import { expectRegion, ImagePage } from "./support/image-page";
import { sql } from "./support/services";
import { expect, test, type TestImage } from "./support/world";

// Annotations (docs/system-tests.md). Boxes are drawn with the mouse on a 1280 × 800 window, where
// the image fills the screen; they keep to its left half, clear of the UI panel on the right.

const regionsOf = (image: TestImage) =>
  sql<{ id: string; x: number; y: number; w: number; h: number; authorId: string }>(
    `SELECT id, x, y, w, h, "authorId" FROM "Region" WHERE "imageId" = $1 ORDER BY "createdAt"`,
    [image.id],
  );

const annotationsOf = (image: TestImage) =>
  sql<{ id: string; bodyMarkdown: string; authorId: string; regionId: string }>(
    `SELECT a.id, a."bodyMarkdown", a."authorId", a."regionId" FROM "Annotation" a
     JOIN "Region" r ON r.id = a."regionId" WHERE r."imageId" = $1 ORDER BY a."createdAt"`,
    [image.id],
  );

const OPEN_STROKE = /stroke:\s*#facc15/;

test("ANN-01: Create an annotation", async ({ page, world }) => {
  const user = await world.user();
  const image = await world.image(user);
  await world.signIn(page.context(), user);
  const view = new ImagePage(page, image);
  await view.goto();

  await view.panel.getByRole("button", { name: "Annotate", exact: true }).click();
  await expect(view.panel.getByRole("button", { name: "Done annotating" })).toHaveAttribute("aria-pressed", "true");
  await expect(view.panel.getByText("Drag a box over the part of the image you want to explain.")).toBeVisible();

  const box = { x: 0.1, y: 0.2, w: 0.25, h: 0.3 };
  await view.drawBox(box);
  await expect(view.card).toBeVisible();
  await expect(view.panel).toBeHidden();
  // The view zooms in, and the box and the card sit side by side.
  expect((await view.imageBox()).width).toBeGreaterThan(1200);
  const card = (await view.card.boundingBox())!;
  const drawn = (await view.draft.locator(".a9s-shape-handle").boundingBox())!;
  expect(card.x >= drawn.x + drawn.width || card.x + card.width <= drawn.x).toBe(true);

  await view.card.getByLabel("What's in this region?").fill("**Bold** and a [link](https://example.com)");
  await view.card.getByRole("button", { name: "Save" }).click();

  await expect(view.card.locator("strong", { hasText: "Bold" })).toBeVisible();
  await expect(view.card.getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com");
  await expect(view.card.getByText(`By ${user.name}`)).toBeVisible();
  await expect(view.card.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(view.card.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(view.card.getByRole("textbox")).toHaveCount(0);
  // Still in annotate mode (the panel is hidden while the card is open).
  await expect(page.getByRole("button", { name: "Done annotating", includeHidden: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const [region] = await regionsOf(image);
  expect(region.authorId).toBe(user.id);
  expectRegion(region, box);
  // The saved box is the open one, where it was drawn.
  await expect(view.shape(region.id)).toHaveAttribute("style", OPEN_STROKE);
  expectRegion(await view.shapeRegion(region.id), box);
});

test("ANN-02: Annotations are visible to everyone and stay aligned", async ({ page, world }) => {
  const author = await world.user();
  const image = await world.image(author);
  const box = { x: 0.15, y: 0.25, w: 0.2, h: 0.3 };
  const regionId = await world.region(image, author, box, "A *public* annotation");
  const view = new ImagePage(page, image);
  await view.goto();

  await expect(view.shape(regionId)).toBeVisible();
  await expect(view.panel.getByRole("button", { name: "Annotate", exact: true })).toHaveCount(0);
  await expect(view.panel.getByRole("button", { name: "Sign in with GitHub to annotate" })).toBeVisible();

  // Step 2, by clicking the box, then from the list.
  await view.clickAt(box.x + box.w / 2, box.y + box.h / 2);
  await expect(view.card.getByText("public")).toBeVisible();
  await expect(view.card.getByText(`By ${author.name}`)).toBeVisible();
  await view.closeCard();
  await view.pickFromList("A public annotation");
  await expect(view.card.getByText(`By ${author.name}`)).toBeVisible();
  await view.closeCard();

  // Step 3: the box stays over the same part of the image at every size.
  expectRegion(await view.shapeRegion(regionId), box, 0.003);
  await view.panel.getByRole("button", { name: "Zoom in" }).click();
  await view.panel.getByRole("button", { name: "Zoom in" }).click();
  expectRegion(await view.shapeRegion(regionId), box, 0.003);
  await view.panel.getByRole("button", { name: "Zoom out" }).click();
  expectRegion(await view.shapeRegion(regionId), box, 0.003);
  await page.setViewportSize({ width: 400, height: 820 });
  await expect(view.panel).toBeVisible();
  expectRegion(await view.shapeRegion(regionId), box, 0.003);
});

test("ANN-03: Cancelling and leaving annotate mode discard the draft", async ({ page, world }) => {
  const user = await world.user();
  const image = await world.image(user);
  await world.signIn(page.context(), user);
  const view = new ImagePage(page, image);
  await view.goto();

  await view.panel.getByRole("button", { name: "Annotate", exact: true }).click();
  await view.drawBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  await expect(view.card).toBeVisible();
  await expect(view.draft).toHaveCount(1);
  await view.card.getByRole("button", { name: "Cancel" }).click();
  await expect(view.draft).toHaveCount(0);
  await expect(view.card).toBeHidden();

  // Step 2: the panel is hidden while the editor is open, so close the card to reach Done annotating.
  await view.drawSomewhere();
  await expect(view.card).toBeVisible();
  await expect(view.draft).toHaveCount(1);
  await view.closeCard();
  await expect(view.draft).toHaveCount(0);
  await view.panel.getByRole("button", { name: "Done annotating" }).click();
  await expect(view.panel.getByRole("button", { name: "Annotate", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(view.draft).toHaveCount(0);
  await expect(view.shapes).toHaveCount(0);

  expect(await annotationsOf(image)).toEqual([]);
});

test("ANN-04: Annotation text is rendered safely", async ({ page, world }) => {
  const user = await world.user();
  const image = await world.image(user);
  await world.signIn(page.context(), user);
  const view = new ImagePage(page, image);
  await view.goto();
  page.on("dialog", (dialog) => {
    throw new Error(`Annotation text opened a dialog: ${dialog.message()}`);
  });

  const text =
    '<b onclick="alert(1)">html</b> [bad](javascript:alert(1)) ![pic](https://example.com/x.png) [good](https://example.com)';
  await view.panel.getByRole("button", { name: "Annotate", exact: true }).click();
  await view.drawBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  await view.card.getByLabel("What's in this region?").fill(text);
  await view.card.getByRole("button", { name: "Save" }).click();

  const good = view.card.getByRole("link", { name: "good" });
  await expect(good).toBeVisible();
  // The HTML shows as text.
  await expect(view.card.getByText('<b onclick="alert(1)">html</b>', { exact: false })).toBeVisible();
  await expect(view.card.locator("b")).toHaveCount(0);
  await expect(view.card.locator("[onclick]")).toHaveCount(0);
  // The unsafe link's URL is dropped, so it's plain text, and no image loads.
  await expect(view.card.getByText("bad")).toBeVisible();
  await expect(view.card.getByRole("link", { name: "bad" })).toHaveCount(0);
  await expect(view.card.locator('[href^="javascript:"]')).toHaveCount(0);
  await expect(view.card.locator("img")).toHaveCount(0);
  await expect(good).toHaveAttribute("href", "https://example.com");
  await expect(good).toHaveAttribute("target", "_blank");
  await expect(good).toHaveAttribute("rel", "nofollow ugc noopener noreferrer");
});

test("ANN-05: The annotation action rejects requests that aren't signed in", async ({ page, world }) => {
  const user = await world.user();
  const image = await world.image(user);
  await world.signIn(page.context(), user);
  const view = new ImagePage(page, image);
  await view.goto();

  await view.panel.getByRole("button", { name: "Annotate", exact: true }).click();
  await view.drawBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 });
  await view.card.getByLabel("What's in this region?").fill("Signed out by now");

  const other = await page.context().newPage();
  await other.goto("/");
  await other.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await expect(other.getByRole("banner").getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();

  await view.card.getByRole("button", { name: "Save" }).click();
  await expect(view.card.getByRole("alert")).toHaveText("Sign in to annotate.");
  expect(await annotationsOf(image)).toEqual([]);
});

test("ANN-06: Annotate again straight after saving (steps 1 and 2)", async ({ page, world }) => {
  const user = await world.user();
  const image = await world.image(user);
  await world.signIn(page.context(), user);
  const view = new ImagePage(page, image);
  await view.goto();

  await view.panel.getByRole("button", { name: "Annotate", exact: true }).click();
  await view.drawBox({ x: 0.1, y: 0.1, w: 0.15, h: 0.15 });
  await view.card.getByLabel("What's in this region?").fill("First box");
  await view.card.getByRole("button", { name: "Save" }).click();
  // While saving, the editor stays, then hands over to the saved box's card: never an empty editor.
  await expect(view.card.getByText("First box")).toBeVisible();
  await expect(view.card.getByRole("textbox")).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(view.card.getByRole("textbox")).toHaveCount(0);
  await expect(view.shapes).toHaveCount(1);
  await expect(view.draft).toHaveCount(0);

  // Step 2: still in annotate mode, so a new box can be drawn straight away.
  await view.drawSomewhere();
  const editor = view.card.getByLabel("What's in this region?");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("");
  await expect(editor).toBeFocused();
  await expect(view.card.getByText("First box")).toHaveCount(0);
  await expect(view.draft).toHaveCount(1);
  await expect(view.shapes).toHaveCount(1);
});

test("ANN-07: A click on nested boxes goes to the smaller one", async ({ page, world }) => {
  const author = await world.user();
  const image = await world.image(author);
  // A large box, and a small one overlapping its corner, as Raphael's and Ptolemy's in The School
  // of Athens.
  await world.region(image, author, { x: 0.1, y: 0.1, w: 0.4, h: 0.6 }, "The large box");
  await world.region(image, author, { x: 0.42, y: 0.55, w: 0.12, h: 0.2 }, "The small box");
  const view = new ImagePage(page, image);
  await view.goto();

  await view.clickAt(0.2, 0.25);
  await expect(view.card.getByText("The large box")).toBeVisible();

  await view.goto();
  await view.clickAt(0.46, 0.62);
  await expect(view.card.getByText("The small box")).toBeVisible();
  await expect(view.card.getByText("The large box")).toHaveCount(0);
});

test("ANN-08: An overlapping box is refused, and you can add to the existing one instead", async ({ page, world }) => {
  const other = await world.user({ name: "Other" });
  const image = await world.image(other);
  const existing = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
  const regionId = await world.region(image, other, existing, "Their annotation");
  const user = await world.user();
  await world.signIn(page.context(), user);
  const view = new ImagePage(page, image);
  await view.goto();

  // Step 1.
  await view.panel.getByRole("button", { name: "Annotate", exact: true }).click();
  await view.drawBox({ x: 0.105, y: 0.105, w: 0.29, h: 0.29 });
  const clash = view.card.getByRole("alert");
  await expect(clash).toContainText("This box overlaps an existing one too much");
  await expect(clash.getByRole("button", { name: "Add to that annotation" })).toBeVisible();
  await expect(clash.getByRole("button", { name: "Adjust my box" })).toBeVisible();
  await view.card.getByLabel("What's in this region?").fill("Mine");
  await expect(view.card.getByRole("button", { name: "Save" })).toBeDisabled();

  // Step 2: dragging the draft's left corners out to the screen's edge makes it clearly larger, which
  // clears the warning; dragging them back brings it back.
  const viewport = page.viewportSize()!;
  const topLeft = await view.handle("topleft");
  const bottomLeft = await view.handle("bottomleft");
  await view.dragOnScreen(topLeft, { x: 8, y: 8 });
  await view.dragOnScreen(await view.handle("bottomleft"), { x: 8, y: viewport.height - 8 });
  await expect(clash).toBeHidden();
  await expect(view.card.getByRole("button", { name: "Save" })).toBeEnabled();
  await view.dragOnScreen(await view.handle("topleft"), topLeft);
  await view.dragOnScreen(await view.handle("bottomleft"), bottomLeft);
  await expect(clash).toBeVisible();

  // Step 3.
  await clash.getByRole("button", { name: "Add to that annotation" }).click();
  await expect(view.shapes).toHaveCount(1);
  const add = view.card.getByLabel("Add your annotation");
  await expect(add).toBeVisible();
  await expect(view.card.getByText("Their annotation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Annotate", exact: true, includeHidden: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // Step 4.
  await add.fill("My addition");
  await view.card.getByRole("button", { name: "Save" }).click();
  await expect(view.card.getByText("My addition")).toBeVisible();
  const items = view.card.getByText(/^By /);
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText(other.name);
  await expect(items.nth(1)).toContainText(user.name);
  await expect(view.card.getByRole("button", { name: "Edit" })).toHaveCount(1);
  await expect(view.card.getByRole("button", { name: "Delete" })).toHaveCount(1);
  await expect(view.card.getByRole("button", { name: "+ Add your annotation" })).toHaveCount(0);
  await view.closeCard();
  await view.panel.getByRole("button", { name: "1 annotation" }).click();
  await expect(view.panel.getByRole("button", { name: "Their annotation +1" })).toBeVisible();

  // Step 5: someone else drew the box, so only the text can change.
  await view.panel.getByRole("button", { name: "Their annotation +1" }).click();
  await view.card.getByRole("button", { name: "Edit" }).click();
  await expect(view.card.getByLabel("Edit annotation")).toHaveValue("My addition");
  await expect(view.card.getByText("Drag the box or its corners to adjust it.")).toHaveCount(0);
  await view.card.getByLabel("Edit annotation").fill("My edited addition");
  await view.card.getByRole("button", { name: "Save" }).click();
  await expect(view.card.getByText("My edited addition")).toBeVisible();

  const [region] = await regionsOf(image);
  expect(region.id).toBe(regionId);
  expectRegion(region, existing, 1e-9);
});
