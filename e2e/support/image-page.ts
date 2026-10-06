import { expect, type Page } from "@playwright/test";
import type { Region } from "@/lib/regions";
import type { TestImage } from "./world";

/** Drives the image page (docs/enrich-UI.md): the artwork, its boxes, the UI panel and the card. */
export class ImagePage {
  constructor(
    readonly page: Page,
    readonly image: TestImage,
  ) {}

  readonly panel = this.page.getByRole("region", { name: "Image controls" });
  readonly card = this.page.getByRole("dialog", { name: "Annotation" });
  readonly picture = this.page.getByRole("img", { name: this.image.title, exact: true });

  async goto() {
    await this.page.goto(`/images/${this.image.id}`);
    // Annotorious has attached once its layer is there, and the view is set once the stage shows.
    await expect(this.page.locator("svg.a9s-annotationlayer")).toBeAttached();
    await expect(this.picture).toBeVisible();
  }

  /** A saved box's outline on the image. */
  shape(regionId: string) {
    return this.page.locator(`g.a9s-annotation[data-id="${regionId}"] rect.a9s-inner`);
  }

  /** The saved boxes on the image. A box being drawn or edited moves to Annotorious's editor layer. */
  readonly shapes = this.page.locator("svg.a9s-annotationlayer > g:not(.drawing) g.a9s-annotation");

  /** The box being drawn, or edited with handles. */
  readonly draft = this.page.locator("svg.a9s-annotationlayer g.drawing g.a9s-annotation.selected");

  /** The screen centre of one of the draft's corner handles. */
  async handle(corner: "topleft" | "topright" | "bottomleft" | "bottomright") {
    const box = await this.draft.locator(`.a9s-corner-handle-${corner}`).boundingBox();
    if (!box) throw new Error(`The ${corner} handle isn't on screen.`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** Drag the mouse between two screen points. */
  async dragOnScreen(a: { x: number; y: number }, b: { x: number; y: number }) {
    await this.page.mouse.move(a.x, a.y);
    await this.page.mouse.down();
    await this.page.mouse.move(b.x, b.y, { steps: 12 });
    await this.page.mouse.up();
  }

  /**
   * A place on screen of this size, on the image and clear of the UI panel, the card and the saved
   * boxes: for a second box after the view has zoomed to the first, or a click on empty image.
   */
  async freeSpot(size: { w: number; h: number }) {
    const viewport = this.page.viewportSize()!;
    const image = await this.imageBox();
    const obstacles = [];
    for (const l of [this.panel, this.card]) if (await l.isVisible()) obstacles.push((await l.boundingBox())!);
    for (const shape of await this.shapes.all()) {
      const b = await shape.boundingBox();
      if (b) obstacles.push(b);
    }
    const margin = 12;
    const left = Math.max(image.x, 0) + margin;
    const top = Math.max(image.y, 0) + margin;
    const right = Math.min(image.x + image.width, viewport.width) - margin;
    const bottom = Math.min(image.y + image.height, viewport.height) - margin;
    for (let y = top; y + size.h <= bottom; y += 20) {
      for (let x = left; x + size.w <= right; x += 20) {
        const clear = obstacles.every(
          (o) =>
            x + size.w + margin < o.x || x > o.x + o.width + margin || y + size.h + margin < o.y || y > o.y + o.height + margin,
        );
        if (clear) return { x, y, width: size.w, height: size.h };
      }
    }
    throw new Error("No free space on screen.");
  }

  /** Draw a box wherever there's room on screen (see freeSpot). */
  async drawSomewhere(size = { w: 120, h: 90 }) {
    const { x, y } = await this.freeSpot(size);
    await this.dragOnScreen({ x, y }, { x: x + size.w, y: y + size.h });
  }

  /** Where the image is on screen. */
  async imageBox() {
    const box = await this.picture.boundingBox();
    if (!box) throw new Error("The image isn't on screen.");
    return box;
  }

  /** The screen point at a fraction of the image. */
  async point(fx: number, fy: number) {
    const box = await this.imageBox();
    return { x: box.x + fx * box.width, y: box.y + fy * box.height };
  }

  /** Click the image at a fraction of its size. */
  async clickAt(fx: number, fy: number) {
    const { x, y } = await this.point(fx, fy);
    await this.page.mouse.click(x, y);
  }

  /** Drag on the image, between fractions of its size. */
  async drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    await this.dragOnScreen(await this.point(from.x, from.y), await this.point(to.x, to.y));
  }

  /** Draw a box in annotate mode. */
  async drawBox(r: Region) {
    await this.drag({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h });
  }

  /** Where a box's outline is, as fractions of the image as it's shown now. */
  async shapeRegion(regionId: string): Promise<Region> {
    const image = await this.imageBox();
    const shape = await this.shape(regionId).boundingBox();
    if (!shape) throw new Error(`Box ${regionId} isn't on screen.`);
    return {
      x: (shape.x - image.x) / image.width,
      y: (shape.y - image.y) / image.height,
      w: shape.width / image.width,
      h: shape.height / image.height,
    };
  }

  /** Open a box's card from the UI panel's annotation list. */
  async pickFromList(label: string | RegExp) {
    await this.panel.getByRole("button", { name: /^\d+ annotations?/ }).click();
    await this.panel.getByRole("button", { name: label }).click();
    await expect(this.card).toBeVisible();
  }

  /** Close the open card with its close button. */
  async closeCard() {
    await this.card.getByRole("button", { name: "Close" }).click();
    await expect(this.card).toBeHidden();
  }

  /** Open the UI panel's About section: byline, description and image actions. */
  async openAbout() {
    await this.panel.getByRole("button", { name: "About this image" }).click();
  }
}

/** Assert two regions match, to within `tolerance` of the image's size. */
export function expectRegion(actual: Region, expected: Region, tolerance = 0.01) {
  for (const k of ["x", "y", "w", "h"] as const) {
    expect(Math.abs(actual[k] - expected[k]), `${k}: ${actual[k]} vs ${expected[k]}`).toBeLessThanOrEqual(tolerance);
  }
}
