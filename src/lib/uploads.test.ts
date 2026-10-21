import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX, MAX_UPLOAD_BYTES, TITLE_MAX, checkDetails, checkFile } from "./uploads";

describe("checkFile", () => {
  it("accepts JPEG, PNG and WebP up to the size limit", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(checkFile(type, MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("refuses other types, empty files and files over the limit", () => {
    expect(checkFile("image/gif", 100)).toMatch(/JPEG, PNG or WebP/);
    expect(checkFile("image/png", 0)).toMatch(/empty/);
    expect(checkFile("image/png", MAX_UPLOAD_BYTES + 1)).toMatch(/10 MB/);
  });
});

describe("checkDetails", () => {
  it("trims the title and description", () => {
    expect(checkDetails({ title: "  Title ", description: " Text  " })).toEqual({
      title: "Title",
      description: "Text",
      error: null,
    });
  });

  it("needs a title, and limits both lengths", () => {
    expect(checkDetails({ title: "   ", description: "" }).error).toMatch(/title/);
    expect(checkDetails({ title: "x".repeat(TITLE_MAX), description: "" }).error).toBeNull();
    expect(checkDetails({ title: "x".repeat(TITLE_MAX + 1), description: "" }).error).toMatch(/Titles/);
    expect(checkDetails({ title: "T", description: "x".repeat(DESCRIPTION_MAX + 1) }).error).toMatch(/Descriptions/);
  });
});
