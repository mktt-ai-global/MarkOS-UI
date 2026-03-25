#!/bin/bash

set -euo pipefail

export LC_ALL=C
export LANG=C

REF="${1:-HEAD}"
VERSION="${2:-$(git describe --tags --always --dirty 2>/dev/null || git rev-parse --short "$REF")}"
OUT_DIR="${3:-release}"

mkdir -p "$OUT_DIR"

tarball="${OUT_DIR}/MarkOS-UI-${VERSION}-source.tar.gz"
zipball="${OUT_DIR}/MarkOS-UI-${VERSION}-source.zip"
checksum_file="${OUT_DIR}/MarkOS-UI-${VERSION}-SHA256SUMS.txt"

rm -f "$tarball" "$zipball" "$checksum_file"

git archive --format=tar.gz --output="$tarball" "$REF"
git archive --format=zip --output="$zipball" "$REF"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$tarball" "$zipball" > "$checksum_file"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$tarball" "$zipball" > "$checksum_file"
else
  echo "Missing checksum tool: expected shasum or sha256sum" >&2
  exit 1
fi

echo "Created:"
echo "  $tarball"
echo "  $zipball"
echo "  $checksum_file"
cat "$checksum_file"
