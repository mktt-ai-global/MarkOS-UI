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

rm -f "$tarball" "$zipball"

git archive --format=tar.gz --output="$tarball" "$REF"
git archive --format=zip --output="$zipball" "$REF"

echo "Created:"
echo "  $tarball"
echo "  $zipball"
shasum -a 256 "$tarball" "$zipball"
