# Release Checklist

## Before tagging

- Ensure `git status` is clean
- Run `npm run check`
- Run `npm audit --omit=dev`
- Verify installer help output:
  - `./install.sh --help`
- Verify config generation:
  - `./install.sh --mode config --domain example.com --gateway-port 18789 --install-dir /srv/markos-ui --output-dir /tmp/markos-ui-config --non-interactive`

## Build release artifacts

- Run:
  - `./scripts/package-release.sh HEAD vX.Y.Z`
- Confirm both files exist in `release/`
- Confirm the checksum file exists:
  - `release/MarkOS-UI-vX.Y.Z-SHA256SUMS.txt`
- Record SHA256 checksums for the release body if needed

## Git steps

- Commit final changes
- Tag the release:
  - `git tag -a vX.Y.Z -m "MarkOS UI vX.Y.Z"`
- Push branch and tag:
  - `git push origin main`
  - `git push origin vX.Y.Z`

## GitHub Release

- Create a new release from tag `vX.Y.Z`
- Use [RELEASE_TEMPLATE.md](./RELEASE_TEMPLATE.md) as the starting body
- Upload:
  - `release/MarkOS-UI-vX.Y.Z-source.tar.gz`
  - `release/MarkOS-UI-vX.Y.Z-source.zip`
  - `release/MarkOS-UI-vX.Y.Z-SHA256SUMS.txt`

## Post-release

- Verify README install commands still point at the correct default branch
- Verify raw `install.sh` download URL works
- If GitHub Actions workflow support is available, move:
  - `docs/github-actions-ci.yml.example`
  - to `.github/workflows/ci.yml`
