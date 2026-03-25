# MarkOS UI — Agent Operating System

> Build, Monitor, and Orchestrate AI Agents — Visually
>
> 可视化构建、监控与编排 AI Agents 的操作系统级 UI

<!-- Add cover.png here -->

---

## What is this? | 这是什么？

MarkOS UI is not just a dashboard — it is a **control surface for an Agent Operating System**.

It provides a visual interface to build, deploy, monitor, and orchestrate autonomous AI agents running on the [OpenClaw](https://github.com/mktt-ai-global) runtime. Think of it as the cockpit for your agent fleet.

MarkOS UI 不只是一个仪表盘，而是一个 **Agent 操作系统的控制台**。它提供了可视化界面来构建、部署、监控和编排运行在 OpenClaw 运行时上的自主 AI Agent。

---

## Features | 核心功能

- **Dashboard** — System metrics, agent activity overview, and real-time health monitoring with interactive charts
- **Agent Management** — View live agents, create agent templates with questionnaire-based workflows, import/export agent packs
- **Skills Library** — Browse, create, and manage agent skills and tool templates with import/export support
- **Chat Interface** — Session history, offline template sessions, and live agent interaction monitor
- **Cron Scheduling** — Scheduled job management with preview and local run history
- **Device Management** — Browser device visibility, pairing scaffolding, and node management
- **Approval Workflows** — Approval queue for agent actions that require human review
- **Terminal Console** — Built-in terminal overlay for direct system interaction
- **Settings & Themes** — Gateway connection config, two visual themes (Frost light / Midnight dark) with frosted glass design
- **Template Studio** — Import `.md`, `.txt`, `.json`, `.yaml`, `.yml`, `.rtf` files; questionnaire-based creation; artifact preview; single-file pack export and re-import
- **Notifications** — Real-time toast notifications with history tracking for gateway events
- **Responsive Layout** — Full mobile support with bottom tab navigation and desktop sidebar

---

## Quick Start | 快速开始

```bash
git clone https://github.com/mktt-ai-global/MarkOS-UI.git
cd MarkOS-UI
npm install
npm run dev
```

Open: [http://localhost:5173](http://localhost:5173)

> No OpenClaw gateway? No problem — the UI runs with built-in mock data so you can explore every page immediately.
>
> 没有 OpenClaw 网关？没关系 — UI 内置了模拟数据，你可以立即浏览每个页面。

---

## One-Command Deployment | 一键部署

```bash
./install.sh
```

The installer performs the following steps:

1. Checks prerequisites (Node.js 22+, npm)
2. Installs or detects OpenClaw globally
3. Runs OpenClaw onboarding if no configuration exists
4. Installs UI dependencies (`npm install`)
5. Builds the production bundle (`npm run build`)
6. Starts the OpenClaw gateway (if not already running) and serves the built UI

For VPS/production deployment with Nginx reverse proxy and systemd service configuration:

```bash
./install.sh --deploy-guide
```

This prints a complete deployment guide including Nginx config (with SPA fallback and WebSocket proxy), systemd service file, and HTTPS setup with Let's Encrypt.

---

## Architecture | 系统架构

```
MarkOS UI (React + Vite)
   |
   | WebSocket / HTTP
   v
OpenClaw Gateway (:18789)
   |
   v
Orchestrator
   |
   v
Agents  <-->  Skills / Tools
```

The UI communicates with the OpenClaw gateway over WebSocket for real-time events and HTTP for REST operations. When no gateway is available, all pages fall back to local mock data and template workflows stored in browser storage.

---

## Tech Stack | 技术栈

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| Charts | Recharts 3 |
| Animations | Framer Motion |
| Icons | Lucide React |
| Design | Frosted glass (Apple-inspired, light/dark themes) |

---

## Scripts | 可用脚本

```bash
npm run dev        # Start development server
npm run build      # TypeScript check + production build
npm run preview    # Serve the built bundle locally
npm run lint       # Run ESLint
npm run test       # Run unit tests
npm run check      # Lint + test + build (CI)
```

---

## Vision | 愿景

We are building toward a future where AI agents collaborate like teams — where workflows evolve autonomously, systems observe and improve themselves, and the human operator has full visibility and control through a single pane of glass.

MarkOS UI is the first step: giving you the operating system interface to make that future manageable, observable, and beautiful.

我们正在构建一个未来：AI Agent 像团队一样协作，工作流自主进化，系统自我观察和改进，而人类操作者通过一块玻璃面板拥有全面的可见性和控制力。MarkOS UI 是第一步。

---

## License | 许可证

[MIT](LICENSE)
