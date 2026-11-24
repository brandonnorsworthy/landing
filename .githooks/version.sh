#!/usr/bin/env bash
# Shared by the hooks and CI: where this repo's version lives and what counts as code.
# The only repo-specific file in .githooks/; the hooks themselves are the same everywhere.

# The product version is <Version> in Directory.Build.props (the image is tagged with it).
VERSION_FILE="Directory.Build.props"

# Files whose change never needs a version bump (docs, CI, the hooks, repo meta, design mockups).
NON_CODE_PATTERN='(^|/)[^/]*\.md$|^docs/|^mockups/|^\.github/|^\.githooks/|^\.gitignore$|^LICENSE'

# Prints the version at a git ref ("" = the working tree).
version_read() {
  local ref="${1:-}" text
  if [ -n "$ref" ]; then
    text=$(git show "$ref:$VERSION_FILE" 2>/dev/null) || return 0
  else
    text=$(cat "$VERSION_FILE")
  fi
  printf '%s\n' "$text" | sed -n 's|.*<Version>\([^<]*\)</Version>.*|\1|p' | head -n1
}

# Writes a new version.
version_write() {
  local new="$1"
  sed -i 's|<Version>[^<]*</Version>|<Version>'"$new"'</Version>|' "$VERSION_FILE"
}

# The files version_write touches.
VERSION_FILES=("$VERSION_FILE")

# Reads file names on stdin; succeeds when at least one is code.
has_code_change() {
  grep -Ev "$NON_CODE_PATTERN" | grep -q .
}

# next_version <current> <major|minor|patch>
next_version() {
  local major minor patch
  IFS=. read -r major minor patch <<<"${1%%[-+]*}"
  case "$2" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
  esac
}
