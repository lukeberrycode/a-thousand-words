import { describe, expect, it } from "vitest";
import { r2ClientConfig } from "./r2-config";

const keys = { R2_ACCESS_KEY_ID: "id", R2_SECRET_ACCESS_KEY: "secret" };

describe("r2ClientConfig", () => {
  it("uses the account's R2 endpoint, virtual-hosted style, when R2_ENDPOINT isn't set", () => {
    expect(r2ClientConfig({ ...keys, R2_ACCOUNT_ID: "abc123" })).toEqual({
      region: "auto",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
      forcePathStyle: false,
      credentials: { accessKeyId: "id", secretAccessKey: "secret" },
    });
  });

  it("uses R2_ENDPOINT with path-style URLs when it's set, and needs no account ID", () => {
    const config = r2ClientConfig({ ...keys, R2_ENDPOINT: "http://localhost:3101/" });
    expect(config.endpoint).toBe("http://localhost:3101");
    expect(config.forcePathStyle).toBe(true);
  });

  it("treats an empty R2_ENDPOINT as unset", () => {
    expect(r2ClientConfig({ ...keys, R2_ACCOUNT_ID: "abc", R2_ENDPOINT: "" }).forcePathStyle).toBe(false);
  });

  it("names the missing variable", () => {
    expect(() => r2ClientConfig(keys)).toThrow("R2_ACCOUNT_ID");
    expect(() => r2ClientConfig({ R2_ENDPOINT: "http://localhost:1", R2_ACCESS_KEY_ID: "id" })).toThrow(
      "R2_SECRET_ACCESS_KEY",
    );
  });
});
