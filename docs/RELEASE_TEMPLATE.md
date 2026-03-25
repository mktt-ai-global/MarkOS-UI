# GitHub Release Template

Use this body when editing a GitHub release for MarkOS UI, whether the release was generated automatically from `.github/workflows/release.yml` or assembled manually.

## Title

`MarkOS UI vX.Y.Z`

## Highlights

- Interactive one-click installer for `local`, `vps`, `docker`, and `config` modes
- Built-in domain, port, and install directory configuration
- VPS deployment with Nginx, systemd, Let's Encrypt, and automatic certificate renewal
- Docker deployment path for quick self-hosting
- Refined README and release packaging workflow

## Quick Start

### Local preview

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mktt-ai-global/MarkOS-UI/main/install.sh)
```

### VPS deployment

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mktt-ai-global/MarkOS-UI/main/install.sh) --mode vps --domain ai.example.com --email ops@example.com
```

### Docker deployment

```bash
docker compose up -d --build
```

## Included in this release

- Updated installer flow with deployment summary and confirmation page
- Step-by-step installer progress with troubleshooting hints and maintenance commands
- Nginx and systemd deployment templates
- Dockerfile and `docker-compose.yml`
- Release packaging script with SHA256 checksum output
- Refined GitHub-facing README

## Verification

- `npm run check`
- `npm audit --omit=dev`
- `./install.sh --mode config --non-interactive ...`
- `./scripts/package-release.sh HEAD <version>`
- Verify `release/MarkOS-UI-<version>-SHA256SUMS.txt`

## Notes

- Docker runtime validation depends on Docker being available on the host machine.
- VPS HTTPS auto-renew relies on `certbot.timer` or the distro's certbot renewal integration.
