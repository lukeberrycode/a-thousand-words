import { ImagePage } from "./support/image-page";
import { expect, test } from "./support/world";

// MAN-10 in a desktop browser with a mouse. Trackpad pinches, touch, phones and screen cut-outs
// stay manual.

test("MAN-10: Zoom, pan and the UI panel (desktop, mouse)", async ({ page, world }) => {
  const owner = await world.user();
  const image = await world.image(owner);
  const regionId = await world.region(image, owner, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, "A box");
  await world.signIn(page.context(), owner);
  const view = new ImagePage(page, image);
  await view.goto();
  const viewport = page.viewportSize()!;
  const panelEdge = () => view.panel.getByRole("button", { name: /^Move this panel to the/ }).getAttribute("aria-label");
  // The label names where the panel would go: it's now on the other side.
  const ON_RIGHT = "Move this panel to the left";
  const ON_LEFT = "Move this panel to the right";

  // Step 1: the whole image is visible, with the panel on the right in landscape.
  const fit = await view.imageBox();
  expect(fit.x).toBeGreaterThanOrEqual(0);
  expect(fit.y).toBeGreaterThanOrEqual(0);
  expect(fit.x + fit.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(fit.y + fit.height).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(await panelEdge()).toBe(ON_RIGHT);
  const panel = (await view.panel.boundingBox())!;
  expect(panel.x + panel.width).toBeGreaterThan(viewport.width - 20);

  // Step 2: each zooms, and zooming out stops at the fit size.
  const zoomIn = view.panel.getByRole("button", { name: "Zoom in" });
  const zoomOut = view.panel.getByRole("button", { name: "Zoom out" });
  await zoomIn.click();
  expect((await view.imageBox()).width).toBeCloseTo(fit.width * 1.5, 0);
  await zoomOut.click();
  await zoomOut.click();
  expect((await view.imageBox()).width).toBeCloseTo(fit.width, 0);

  // The mouse wheel zooms around the pointer: the image point under it stays put.
  const at = await view.point(0.3, 0.4);
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await view.imageBox()).width).toBeGreaterThan(fit.width * 1.2);
  const after = await view.point(0.3, 0.4);
  expect(Math.abs(after.x - at.x)).toBeLessThan(2);
  expect(Math.abs(after.y - at.y)).toBeLessThan(2);

  // Keys: + zooms in, Ctrl + 0 goes back to the fit size, Ctrl + + zooms in. The page never zooms.
  await page.keyboard.press("Control+0");
  await expect.poll(async () => (await view.imageBox()).width).toBeCloseTo(fit.width, 0);
  await page.keyboard.press("+");
  await expect.poll(async () => (await view.imageBox()).width).toBeCloseTo(fit.width * 1.5, 0);
  await page.keyboard.press("Control+0");
  await page.keyboard.press("Control+=");
  await expect.poll(async () => (await view.imageBox()).width).toBeCloseTo(fit.width * 1.5, 0);
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);

  // Step 3: zoomed in, dragging the image left puts the panel on the left, and back again.
  await zoomIn.click();
  const middle = { x: viewport.width / 2 - 100, y: viewport.height / 2 };
  await view.dragOnScreen(middle, { x: middle.x - 250, y: middle.y });
  await expect.poll(panelEdge).toBe(ON_LEFT);
  await view.dragOnScreen({ x: middle.x + 150, y: middle.y }, { x: middle.x + 400, y: middle.y });
  await expect.poll(panelEdge).toBe(ON_RIGHT);
  // The flip button swaps edges.
  await view.panel.getByRole("button", { name: ON_RIGHT }).click();
  await expect.poll(panelEdge).toBe(ON_LEFT);
  expect((await view.panel.boundingBox())!.x).toBeLessThan(20);
  await view.panel.getByRole("button", { name: ON_LEFT }).click();
  await expect.poll(panelEdge).toBe(ON_RIGHT);

  // Step 4: arrow keys and trackpad-style scrolling pan, and move the panel like a drag.
  const start = await view.imageBox();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await view.imageBox()).x).toBeLessThan(start.x - 100);
  await expect.poll(panelEdge).toBe(ON_LEFT);
  const scrolled = await view.imageBox();
  await page.mouse.move(middle.x, middle.y);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(-30.5, 0.5);
  await expect.poll(async () => (await view.imageBox()).x).toBeGreaterThan(scrolled.x + 100);
  expect((await view.imageBox()).width).toBeCloseTo(scrolled.width, 0);
  await expect.poll(panelEdge).toBe(ON_RIGHT);

  // Step 5: the boxes button hides the boxes; annotate mode shows them again, and turns zoom off.
  await expect(view.shape(regionId)).toBeVisible();
  await view.panel.getByRole("button", { name: "Hide boxes" }).click();
  await expect(view.shape(regionId)).toBeHidden();
  await view.panel.getByRole("button", { name: "Annotate", exact: true }).click();
  await expect(view.shape(regionId)).toBeVisible();
  await expect(zoomIn).toBeDisabled();
  await expect(zoomOut).toBeDisabled();
});
