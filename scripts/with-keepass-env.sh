#!/bin/sh
# Runs a command with settings from a KeePassXC entry (ADR 0019), so no production or preview secret
# is kept in a file in the project. Used by the prod:* and preview:* scripts in package.json:
#   sh scripts/with-keepass-env.sh <entry> <command> [args...]
# The entry's Notes hold one KEY="value" line per variable; the format is in the README ("KeePassXC
# entries"). KeePassXC asks for the database's password once; a key file is used too if
# KEEPASS_KEY_FILE is set. If the entries are in a group, KEEPASS_GROUP is its path, e.g. Projects.
set -eu

: "${KEEPASS_DB:?Set KEEPASS_DB to the path of your KeePassXC database (.kdbx).}"
if [ $# -lt 2 ]; then
  echo "Usage: sh scripts/with-keepass-env.sh <entry> <command> [args...]" >&2
  exit 2
fi
entry=$1
shift
group=${KEEPASS_GROUP:-}
group=${group#/}
group=${group%/}
if [ -n "$group" ]; then
  entry="$group/$entry"
fi

for old in .env.prod .env.preview; do
  if [ -f "$old" ]; then
    echo "Note: $old is no longer used. Delete it once its values are in KeePassXC." >&2
  fi
done

# keepassxc-cli as installed, or from the KeePassXC Flatpak.
keepassxc() {
  if command -v keepassxc-cli >/dev/null 2>&1; then
    keepassxc-cli "$@"
  else
    flatpak run --command=keepassxc-cli org.keepassxc.KeePassXC "$@"
  fi
}

if [ -n "${KEEPASS_KEY_FILE:-}" ]; then
  notes=$(keepassxc show --attributes Notes --key-file "$KEEPASS_KEY_FILE" "$KEEPASS_DB" "$entry")
else
  notes=$(keepassxc show --attributes Notes "$KEEPASS_DB" "$entry")
fi

# Export each KEY=value line, without eval, so a value is never run as shell code. Error messages
# give line numbers, never the line, which may hold a secret.
cr=$(printf '\r')
n=0
while IFS= read -r line; do
  n=$((n + 1))
  line=${line%"$cr"}
  case $line in '' | '#'*) continue ;; esac
  case $line in *=*) ;; *)
    echo "Line $n of $entry's Notes isn't KEY=value." >&2
    exit 1
    ;;
  esac
  name=${line%%=*}
  value=${line#*=}
  case $name in '' | [0-9]* | *[!A-Za-z0-9_]*)
    echo "Line $n of $entry's Notes doesn't start with a variable name." >&2
    exit 1
    ;;
  esac
  case $value in
  \"*\")
    value=${value#\"}
    value=${value%\"}
    ;;
  \'*\')
    value=${value#\'}
    value=${value%\'}
    ;;
  esac
  export "$name=$value"
done <<EOF
$notes
EOF

if [ -z "${DATABASE_URL:-}" ]; then
  echo "$entry's Notes don't set DATABASE_URL." >&2
  exit 1
fi

exec "$@"
