// Import the Vitest functions for grouping and asserting.
import { describe, expect, it } from "vitest";

// Import the check under test.
import { driveLetterProblem } from "./drive-letter.mjs";

// Group the tests for the drive letter check.
describe("driveLetterProblem", () => {
  // A capital drive letter.
  it("allows a capital drive letter on Windows", () => {
    // No problem.
    expect(driveLetterProblem("win32", "C:\\Users\\Luke\\repo")).toBeNull();
  });

  // A lower-case drive letter.
  it("refuses a lower-case drive letter on Windows, and names the folder to change to", () => {
    // The problem gives the same folder with a capital letter.
    expect(driveLetterProblem("win32", "c:\\Users\\Luke\\repo")).toContain('cd "C:\\Users\\Luke\\repo"');
  });

  // Other systems.
  it("ignores other systems", () => {
    // Linux paths have no drive letter.
    expect(driveLetterProblem("linux", "/home/luke/repo")).toBeNull();

    // A path that looks like one is still fine off Windows.
    expect(driveLetterProblem("darwin", "c:/odd")).toBeNull();
  });

  // A Windows path with no drive letter.
  it("allows a network path on Windows", () => {
    // UNC paths start with two backslashes.
    expect(driveLetterProblem("win32", "\\\\server\\share\\repo")).toBeNull();
  });
});
