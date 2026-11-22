// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the mock settings and helpers under test.
import { MOCK_BUCKET, localR2Port, mockR2Env, usesLocalR2 } from "./mock-env";

// Import the client config builder, to check the two work together.
import { r2ClientConfig } from "./r2-config";

// Group the tests for the mock settings.
describe("mockR2Env", () => {
  // Check the generated URLs and bucket.
  it("points the client and public URLs at the mock's port and bucket", () => {
    // Build settings for port 3101.
    const env = mockR2Env(3101);

    // The endpoint uses that port.
    expect(env.R2_ENDPOINT).toBe("http://localhost:3101");

    // The public URL adds the bucket name.
    expect(env.R2_PUBLIC_URL).toBe(`http://localhost:3101/${MOCK_BUCKET}`);

    // The bucket is the mock bucket.
    expect(env.R2_BUCKET).toBe(MOCK_BUCKET);
  });

  // Check the settings are complete.
  it("is enough for the R2 client on its own", () => {
    // The client config builds without any other variables.
    expect(r2ClientConfig(mockR2Env(3101))).toMatchObject({ endpoint: "http://localhost:3101", forcePathStyle: true });
  });

  // Check the settings are detected as local.
  it("is recognised as local", () => {
    // The settings count as local R2.
    expect(usesLocalR2(mockR2Env(3101))).toBe(true);

    // The port can be read back from the endpoint.
    expect(localR2Port(mockR2Env(23456).R2_ENDPOINT)).toBe(23456);
  });
});

// Group the tests for the local-R2 check.
describe("usesLocalR2", () => {
  // Check the cases that aren't local.
  it("is false for Cloudflare, an unset or empty endpoint, or a bad URL", () => {
    // No endpoint at all.
    expect(usesLocalR2({})).toBe(false);

    // An empty endpoint.
    expect(usesLocalR2({ R2_ENDPOINT: "" })).toBe(false);

    // A Cloudflare endpoint.
    expect(usesLocalR2({ R2_ENDPOINT: "https://abc.r2.cloudflarestorage.com" })).toBe(false);

    // Something that isn't a URL.
    expect(usesLocalR2({ R2_ENDPOINT: "not a url" })).toBe(false);
  });

  // Check the loopback hosts.
  it("is true for loopback addresses", () => {
    // Try each loopback hostname in turn.
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      // Each one counts as local.
      expect(usesLocalR2({ R2_ENDPOINT: `http://${host}:3001` })).toBe(true);
    }
  });
});
