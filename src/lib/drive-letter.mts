// A check that Vitest runs from a folder whose Windows drive letter is a capital. Started from
// `c:\...` (as VS Code's terminal sometimes is), Vitest loads itself twice, once under each
// spelling, and every suite fails before a test runs with "Cannot read properties of undefined
// (reading 'config')" or "Vitest failed to find the runner".

/** Why the tests can't run from `cwd` on `platform`, with how to fix it, or null if they can. */
export function driveLetterProblem(platform: string, cwd: string): string | null {
  // Only Windows has drive letters.
  if (platform !== "win32") return null;

  // Find a lower-case drive letter at the start of the path.
  const match = /^([a-z]):/.exec(cwd);

  // A capital letter, or no letter at all, is fine.
  if (!match) return null;

  // The same folder with a capital drive letter.
  const fixed = match[1].toUpperCase() + cwd.slice(1);

  // Say what's wrong and how to fix it.
  return (
    `The tests can't run from ${cwd}: its drive letter is lower case, so Vitest loads itself twice and every suite fails. ` +
    `Change to the same folder with a capital letter and run them again: cd "${fixed}"`
  );
}
