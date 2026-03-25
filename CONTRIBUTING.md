# Contributing

Thanks for improving MarkOS UI.

## Local Setup

1. Install Node.js 22 or newer.
2. Run `npm ci`.
3. Start the app with `npm run dev`.

## Validation

Use these commands before opening a pull request:

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run check`
- `npm audit --omit=dev` when production dependencies change
- `./install.sh --mode config --domain example.com --gateway-port 18789 --install-dir /tmp/markos-ui --output-dir /tmp/markos-ui-config --non-interactive` when touching installer or deploy templates

## Pull Requests

- Keep changes focused and explain the user impact clearly.
- Update README or docs when installation, release, or operator workflows change.
- Add or update tests when behavior changes.
- Use repository labels so GitHub release notes can categorize the change.

## Releases

- Annotated tags in the form `vX.Y.Z` trigger the GitHub release workflow.
- Manual packaging is available with `./scripts/package-release.sh HEAD vX.Y.Z`.
- Use [`docs/RELEASE_CHECKLIST.md`](./docs/RELEASE_CHECKLIST.md) as the release gate.
