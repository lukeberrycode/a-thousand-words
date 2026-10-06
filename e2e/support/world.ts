import { randomBytes, randomUUID } from "node:crypto";
import { test as base, expect, type BrowserContext } from "@playwright/test";
import { fingerprint } from "@/lib/image-hash";
import type { Region } from "@/lib/regions";
import { newSeed, picture } from "./pictures";
import { deleteObject, putObject, sql } from "./services";

// Test data, made directly in the database and bucket, and removed after each test.
//
// Sign-in is a test double for GitHub: the test creates a Session row and sets Auth.js's session
// cookie to its token, which is what a real GitHub sign-in leaves behind (database sessions,
// ADR 0007). Everything after that, from `auth()` to every server action's checks, runs as normal.
// The real OAuth flow stays a manual test (AUTH-02, AUTH-05).

/** Ids of every user the tests create start with this, so leftovers can be found and removed. */
export const TEST_USER_PREFIX = "e2e-";

const SESSION_COOKIE = "authjs.session-token";

export type TestUser = { id: string; name: string; email: string };
export type TestImage = { id: string; title: string; storageKey: string; width: number; height: number };

export class World {
  private userIds: string[] = [];
  // Boxes and annotations made here are dated an hour ago, a second apart in the order they're
  // made: pages list them oldest first, and an annotation counts as edited once it changes.
  private made = 0;
  private madeAt = () => new Date(Date.now() - 60 * 60 * 1000 + this.made++ * 1000);

  /** A user. Approved unless `approved: false` (a pending account, SEC-03). */
  async user({ name = "Tester", approved = true }: { name?: string; approved?: boolean } = {}): Promise<TestUser> {
    const id = `${TEST_USER_PREFIX}${randomUUID()}`;
    const user = { id, name: `${name} ${id.slice(-6)}`, email: `${id}@example.test` };
    await sql(
      `INSERT INTO "User" (id, name, email, "approvedAt", "updatedAt") VALUES ($1, $2, $3, $4, now())`,
      [id, user.name, user.email, approved ? new Date() : null],
    );
    this.userIds.push(id);
    return user;
  }

  /** Sign `user` in, in every page of `context`. Returns the session token. */
  async signIn(context: BrowserContext, user: TestUser) {
    const sessionToken = randomBytes(32).toString("hex");
    await sql(`INSERT INTO "Session" ("sessionToken", "userId", expires, "updatedAt") VALUES ($1, $2, $3, now())`, [
      sessionToken,
      user.id,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    ]);
    await context.addCookies([
      { name: SESSION_COOKIE, value: sessionToken, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    return sessionToken;
  }

  /** An image owned by `owner`, stored in R2 as an upload would be. */
  async image(
    owner: TestUser,
    { title = "Test image", description = null as string | null, seed = newSeed() } = {},
  ): Promise<TestImage> {
    const file = await picture(seed);
    const fp = await fingerprint(file.buffer);
    const storageKey = `images/${randomUUID()}.png`;
    await putObject(storageKey, file.buffer, file.mimeType);
    const image = { id: newId(), title: `${title} ${storageKey.slice(7, 13)}`, storageKey, width: fp.width, height: fp.height };
    await sql(
      `INSERT INTO "Image" (id, "ownerId", title, description, "storageKey", width, height, sha256, phash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [image.id, owner.id, image.title, description, storageKey, fp.width, fp.height, fp.sha256, fp.phash.toString()],
    );
    return image;
  }

  /** A box on `image` drawn by `author`, with their annotation. Returns the region's id. */
  async region(image: TestImage, author: TestUser, box: Region, body: string) {
    const id = newId();
    await sql(
      `INSERT INTO "Region" (id, "imageId", "authorId", x, y, w, h, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
      [id, image.id, author.id, box.x, box.y, box.w, box.h, this.madeAt()],
    );
    await this.addAnnotation(id, author, body);
    return id;
  }

  /** `author`'s annotation on an existing box. Returns its id. */
  async addAnnotation(regionId: string, author: TestUser, body: string) {
    const id = newId();
    await sql(
      `INSERT INTO "Annotation" (id, "regionId", "authorId", "bodyMarkdown", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $5)`,
      [id, regionId, author.id, body, this.madeAt()],
    );
    return id;
  }

  /** Remove every user this test made, with their images, boxes and annotations, and the images' files. */
  async cleanUp() {
    await removeUsers(this.userIds);
    this.userIds = [];
  }
}

/** Delete users and everything of theirs, including their images' files in R2. */
export async function removeUsers(ids: string[]) {
  if (ids.length === 0) return;
  const images = await sql<{ storageKey: string }>(`SELECT "storageKey" FROM "Image" WHERE "ownerId" = ANY($1)`, [ids]);
  await sql(`DELETE FROM "User" WHERE id = ANY($1)`, [ids]);
  await Promise.all(images.map((i) => deleteObject(i.storageKey)));
}

/** An id for a row the tests create. The app's are cuids; any unique string works. */
const newId = () => `e2e${randomBytes(10).toString("hex")}`;

export const test = base.extend<{ world: World }>({
  // Playwright requires the destructuring pattern; `provide` is its `use`, renamed so the React
  // hooks lint rule doesn't mistake it for React's.
  world: async ({}, provide) => {
    const world = new World();
    await provide(world);
    await world.cleanUp();
  },
});

export { expect };
