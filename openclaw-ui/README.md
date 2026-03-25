# OpenClaw UI

OpenClaw UI is a React + Vite control surface for browsing OpenClaw state, preparing local agent and skill templates, and previewing gateway-driven workflows before a live runtime is fully wired.

## Current Status

- The UI shell, routing, template studio, chat preview, cron preview, devices, approvals, and settings draft workflow are implemented.
- `npm run lint` and `npm run build` currently pass.
- Several runtime write actions still require a real local OpenClaw install before they can be safely validated.

## Scripts

- `npm run dev`: start the Vite development server
- `npm run build`: run TypeScript build and create a production bundle
- `npm run lint`: run ESLint across the project
- `npm run test`: run the lightweight Node-based unit tests for local logic
- `npm run preview`: serve the built bundle locally

## Main Areas

- `src/pages/Dashboard.tsx`: gateway and snapshot overview
- `src/pages/Agents.tsx`: live agent visibility plus local template workflow
- `src/pages/Skills.tsx`: live skill visibility plus local template workflow
- `src/pages/Chat.tsx`: session history, offline template sessions, and live monitor scaffolding
- `src/pages/Cron.tsx`: scheduled job preview and local run history
- `src/pages/Devices.tsx`: browser device visibility and pairing scaffolding
- `src/pages/Approvals.tsx`: approval queue scaffolding
- `src/pages/Settings.tsx`: connection settings and config draft studio
- `src/lib/openclaw-client.ts`: WebSocket gateway client and connection logic
- `src/lib/template-studio.ts`: template import, questionnaire mapping, and artifact generation

## Template Import

The Template Studio supports:

- questionnaire-based creation
- `.md`, `.txt`, `.json`, `.yaml`, `.yml`, and `.rtf` best-effort import
- generated artifact preview
- single-file pack export
- pack re-import with questionnaire snapshot restore
- local template persistence in browser storage

## Known Limits

- Runtime install, activation, and destructive write actions remain gated until a real OpenClaw gateway is available locally.
- The automated tests currently focus on pure local logic such as template import/export, adapters, and draft storage.
- Dashboard-derived charts are still UI estimates unless the gateway exposes a matching snapshot field.

## Installer

`install.sh` checks Node/OpenClaw, builds the app, starts the gateway if needed, and serves the built UI with `vite preview`.

## Deployment

To deploy OpenClaw UI on a VPS or production server:

1. **Build the UI** on the server (or copy the `dist/` folder from a local build):
   ```bash
   npm ci && npm run build
   ```

2. **Run the deploy guide** for detailed Nginx and systemd configuration:
   ```bash
   ./install.sh --deploy-guide
   ```
   This prints a complete Nginx reverse proxy config (with SPA fallback and WebSocket proxy) and a systemd service file for the OpenClaw gateway.

3. **Enable HTTPS** — strongly recommended for production. Use [certbot](https://certbot.eff.org/) with Let's Encrypt:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```
   Certbot will configure TLS and set up automatic certificate renewal.
