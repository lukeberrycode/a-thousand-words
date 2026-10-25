import { describe, expect, it } from "vitest";
import { MOCK_BUCKET, localR2Port, mockR2Env, usesLocalR2 } from "./mock-env";
import { r2ClientConfig } from "./r2-config";

describe("mockR2Env", () => {
  it("points the client and public URLs at the mock's port and bucket", () => {
    const env = mockR2Env(3101);
    expect(env.R2_ENDPOINT).toBe("http://localhost:3101");
    expect(env.R2_PUBLIC_URL).toBe(`http://localhost:3101/${MOCK_BUCKET}`);
    expect(env.R2_BUCKET).toBe(MOCK_BUCKET);
  });

  it("is enough for the R2 client on its own", () => {
    expect(r2ClientConfig(mockR2Env(3101))).toMatchObject({ endpoint: "http://localhost:3101", forcePathStyle: true });
  });

  it("is recognised as local", () => {
    expect(usesLocalR2(mockR2Env(3101))).toBe(true);
    expect(localR2Port(mockR2Env(23456).R2_ENDPOINT)).toBe(23456);
  });
});

describe("usesLocalR2", () => {
  it("is false for Cloudflare, an unset or empty endpoint, or a bad URL", () => {
    expect(usesLocalR2({})).toBe(false);
    expect(usesLocalR2({ R2_ENDPOINT: "" })).toBe(false);
    expect(usesLocalR2({ R2_ENDPOINT: "https://abc.r2.cloudflarestorage.com" })).toBe(false);
    expect(usesLocalR2({ R2_ENDPOINT: "not a url" })).toBe(false);
  });

  it("is true for loopback addresses", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(usesLocalR2({ R2_ENDPOINT: `http://${host}:3001` })).toBe(true);
    }
  });
});
