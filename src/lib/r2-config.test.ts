// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the function under test.
import { r2ClientConfig } from "./r2-config";

// The two credentials every test needs.
const keys = { R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" };

// Group the tests for the config builder.
describe("r2ClientConfig", () => {
  // Check the default (Cloudflare) settings.
  it("uses the account's R2 endpoint, virtual-hosted style, when R2_ENDPOINT isn't set", () => {
    // With only an account ID, the endpoint is built from it.
    expect(r2ClientConfig({ ...keys, R2_ACCOUNT_ID: "abc123" })).toEqual({
      // R2's pseudo-region.
      region: "auto",

      // The account's R2 address.
      endpoint: "https://abc123.r2.cloudflarestorage.com",

      // Bucket in the hostname, not the path.
      forcePathStyle: false,

      // The keys passed in.
      credentials: { accessKeyId: "id", secretAccessKey: "secret" },
    });
  });

  // Check the custom (mock) settings.
  it("uses R2_ENDPOINT with path-style URLs when it's set, and needs no account ID", () => {
    // Build settings with a custom endpoint that has a trailing slash.
    const config = r2ClientConfig({ ...keys, R2_ENDPOINT: "http://localhost:3101/" });

    // The trailing slash is removed.
    expect(config.endpoint).toBe("http://localhost:3101");

    // Path-style URLs are used.
    expect(config.forcePathStyle).toBe(true);
  });

  // Check that an empty value counts as not set.
  it("treats an empty R2_ENDPOINT as unset", () => {
    // An empty endpoint falls back to virtual-hosted style.
    expect(r2ClientConfig({ ...keys, R2_ACCOUNT_ID: "abc", R2_ENDPOINT: "" }).forcePathStyle).toBe(false);
  });

  // Check the error messages.
  it("names the missing variable", () => {
    // No endpoint and no account ID: the error names R2_ACCOUNT_ID.
    expect(() => r2ClientConfig(keys)).toThrow("R2_ACCOUNT_ID");

    // No secret key: the error names R2_SECRET_ACCESS_KEY.
    expect(() => r2ClientConfig({ R2_ENDPOINT: "http://localhost:1", R2_ACCESS_KEY_ID: "id" })).toThrow(
      "R2_SECRET_ACCESS_KEY",
    );
  });
});
