#!/usr/bin/env bash
# Install the versioned pre-push hook for this repository.
#
# Safe to rerun: each install replaces only the hook we manage when it
# already carries our marker, otherwise the existing hook is preserved in
# a timestamped .bak (which this script never overwrites itself).

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_HOOK="${SCRIPT_DIR}/githooks/pre-push"
GIT_ROOT="$(git -C "${ROOT_DIR}" rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "${GIT_ROOT:-}" ]; then
  printf 'install-hooks: not a git working tree (run from the checkout).\n' >&2
  exit 1
fi

if [ ! -f "${SOURCE_HOOK}" ]; then
  printf 'install-hooks: versioned hook missing at %s.\n' "${SOURCE_HOOK}" >&2
  exit 1
fi

HOOK_DIR="${GIT_ROOT}/.git/hooks"
DEST_HOOK="${HOOK_DIR}/pre-push"
mkdir -p "${HOOK_DIR}"

if [ -e "${DEST_HOOK}" ] || [ -L "${DEST_HOOK}" ]; then
  if grep -q 'parsleypantry-pre-push-hook' "${DEST_HOOK}" 2>/dev/null; then
    printf 'install-hooks: replacing managed hook at %s.\n' "${DEST_HOOK}" >&2
  else
    timestamp="$(date +%Y%m%d%H%M%S)"
    backup="${DEST_HOOK}.bak.${timestamp}"
    if [ -e "${backup}" ]; then
      counter=1
      while [ -e "${backup}.${counter}" ]; do
        counter=$((counter + 1))
      done
      backup="${backup}.${counter}"
    fi
    mv "${DEST_HOOK}" "${backup}"
    printf 'install-hooks: preserved existing hook as %s.\n' "${backup}" >&2
  fi
fi

cp "${SOURCE_HOOK}" "${DEST_HOOK}"
chmod +x "${DEST_HOOK}"
printf 'install-hooks: installed pre-push hook at %s.\n' "${DEST_HOOK}" >&2
printf 'Remove it with: rm "%s"\n' "${DEST_HOOK}" >&2
