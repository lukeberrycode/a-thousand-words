// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the limits and checks under test.
import { DESCRIPTION_MAX, MAX_UPLOAD_BYTES, TITLE_MAX, checkDetails, checkFile } from "./uploads";

// Group the tests for the file check.
describe("checkFile", () => {
  // Check the accepted formats.
  it("accepts JPEG, PNG and WebP up to the size limit", () => {
    // Each allowed type, at exactly the size limit, passes.
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(checkFile(type, MAX_UPLOAD_BYTES)).toBeNull();
  });

  // Check the refusals.
  it("refuses other types, empty files and files over the limit", () => {
    // A GIF is refused.
    expect(checkFile("image/gif", 100)).toMatch(/JPEG, PNG or WebP/);

    // A zero-byte file is refused.
    expect(checkFile("image/png", 0)).toMatch(/empty/);

    // A file one byte over the limit is refused.
    expect(checkFile("image/png", MAX_UPLOAD_BYTES + 1)).toMatch(/10 MB/);
  });
});

// Group the tests for the title and description check.
describe("checkDetails", () => {
  // Check whitespace trimming.
  it("trims the title and description", () => {
    // Padded input comes back trimmed, with no error.
    expect(checkDetails({ title: "  Title ", description: " Text  " })).toEqual({
      // The trimmed title.
      title: "Title",

      // The trimmed description.
      description: "Text",

      // No error.
      error: null,
    });
  });

  // Check the required title and the length limits.
  it("needs a title, and limits both lengths", () => {
    // A blank title is refused.
    expect(checkDetails({ title: "   ", description: "" }).error).toMatch(/title/);

    // A title at the limit passes.
    expect(checkDetails({ title: "x".repeat(TITLE_MAX), description: "" }).error).toBeNull();

    // A title over the limit is refused.
    expect(checkDetails({ title: "x".repeat(TITLE_MAX + 1), description: "" }).error).toMatch(/Titles/);

    // A description over the limit is refused.
    expect(checkDetails({ title: "T", description: "x".repeat(DESCRIPTION_MAX + 1) }).error).toMatch(/Descriptions/);
  });
});
