# 19. Read production and preview secrets from KeePassXC, not from files in the project

Date: 2026-10-21 · Status: Accepted

## Context

The `prod:*` and `preview:*` scripts loaded their settings from `.env.prod` and `.env.preview` (ADR 0009): git-ignored files in the project folder holding the production and preview database URLs and R2 keys in plain text. The agent guardrails (ADR 0015) stop Claude Code reading them with its tools. They can't stop the IDE extension, which sends whatever text is selected in the editor along with the next message. On 21 October 2026, a selection in an open `.env.prod` sent the production database password and R2 secret key into a conversation, and both had to be rotated.

The owner keeps every secret in KeePassXC already. Options considered:

- **Move the files out of the project.** Less likely to be open in the editor, but still plain text on disk.
- **Habits:** disconnect the IDE, or clear the selection, before editing the files. Depends on remembering every time.
- **Read the values from KeePassXC when a script runs.** Nothing secret on disk outside the encrypted database.

## Decision

- Each environment's settings live in one KeePassXC entry: `a-thousand-words-prod` and `a-thousand-words-preview`. The entry's Notes hold one `KEY="value"` line per variable, the same format as the old files.
- `scripts/with-keepass-env.sh <entry> <command>` reads the entry's Notes with `keepassxc-cli` (from the KeePassXC Flatpak if the CLI isn't installed), exports each line, and runs the command. One master-password prompt per run; a key file is used too if `KEEPASS_KEY_FILE` is set. It parses the lines rather than running them with `eval`, and its errors give line numbers, never values.
- The database's path comes from `KEEPASS_DB`, set in the owner's shell profile. It isn't a secret.
- `.env.prod` and `.env.preview` are deleted. The script warns if either is still there. The deny rules and sandbox settings that name them stay, in case one comes back.

## Consequences

- No production or preview secret is in a plain-text file in the project, so an editor selection, a `cat`, a backup or a screen share can't expose one.
- Each `prod:*` or `preview:*` run asks for the KeePassXC password. That's a deliberate pause before touching production.
- An agent can't run these scripts usefully even if a deny rule is bypassed: it doesn't know the master password.
- The scripts need KeePassXC on the workstation. Anyone else running them would need their own entry in their own database, or a different backend in the script.
- `.env` still holds local development values in plain text. They reach only the local database and the development bucket.
- This supersedes the bullet on production secrets in ADR 0009. The rest of ADR 0009 stands.
