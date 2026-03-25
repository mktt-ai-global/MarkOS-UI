# GitHub Release Template

Use this body when publishing a new GitHub release for MarkOS UI.

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
- Nginx and systemd deployment templates
- Dockerfile and `docker-compose.yml`
- Release packaging script
- Refined GitHub-facing README

## Verification

- `npm run check`
- `npm audit --omit=dev`
- `./install.sh --mode config --non-interactive ...`
- `./scripts/package-release.sh HEAD <version>`

## Notes

- Docker runtime validation depends on Docker being available on the host machine.
- VPS HTTPS auto-renew relies on `certbot.timer` or the distro's certbot renewal integration.
