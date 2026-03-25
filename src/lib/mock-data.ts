/**
 * Mock data used as fallback when OpenClaw gateway is unavailable.
 * When connected to a real gateway, this data is replaced by live RPC results.
 */

export interface DeviceNode {
  name: string
  type: 'server' | 'compute' | 'mobile'
  status: 'Online' | 'Offline' | 'Idle'
  cpu: number
  mem: number
  disk: number
  ip?: string
}

export interface AgentInfo {
  id: string
  name: string
  model: string
  status: 'active' | 'idle' | 'stopped'
  sessions: number
  tokensUsed: string
  successRate: number
  uptime: string
  lastActive: string
  workspace: string
  identity?: { emoji?: string; avatar?: string }
}

export interface SkillInfo {
  id: string
  name: string
  description: string
  version: string
  category: 'tool' | 'api' | 'custom' | 'system'
  installed: boolean
  usage: number
  author: string
  rating: number
}

export interface ChatSession {
  id: string
  key: string
  title: string
  agent: string
  agentId: string
  lastMessage: string
  timestamp: string
  unread: boolean
  kind: 'main' | 'group' | 'cron' | 'hook' | 'node'
  model: string
  contextTokens: number
  totalTokens: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  agent?: string
  thinking?: string
  toolCalls?: { tool: string; args: string; time: string }[]
}

export interface ChannelInfo {
  name: string
  provider: string
  status: 'connected' | 'disconnected' | 'not configured' | 'error'
  accountId?: string
  dmPolicy?: string
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  scheduleType: 'cron' | 'every' | 'at'
  agentId: string
  enabled: boolean
  lastRun?: string
  nextRun?: string
  status: 'ok' | 'error' | 'pending'
  description?: string
  sessionTarget: string
}

export interface BrowserDeviceInfo {
  id: string
  label: string
  platform: string
  trust: 'paired' | 'pending' | 'revoked'
  origin: string
  lastSeen: string
  authMode: 'shared-token' | 'device-token' | 'password'
}

export interface ApprovalRequestInfo {
  id: string
  agent: string
  scope: string
  summary: string
  status: 'pending' | 'approved' | 'denied'
  requestedAt: string
  requestedBy: string
  risk: 'low' | 'medium' | 'high'
}

// ---- Mock Data ----

export const mockNodes: DeviceNode[] = [
  { name: 'Edge Node 1', type: 'server', status: 'Online', cpu: 62, mem: 45, disk: 30, ip: '127.0.0.1' },
  { name: 'Server Pro', type: 'server', status: 'Offline', cpu: 0, mem: 0, disk: 55, ip: '10.0.0.5' },
  { name: 'Compute Module X', type: 'compute', status: 'Idle', cpu: 8, mem: 22, disk: 40, ip: '192.168.1.42' },
]

export const mockAgents: AgentInfo[] = [
  { id: 'agent-01', name: 'Data Miner', model: 'anthropic/claude-opus-4-6', status: 'active', sessions: 12, tokensUsed: '245K', successRate: 96, uptime: '99.2%', lastActive: '2m ago', workspace: '~/.openclaw/workspace' },
  { id: 'agent-02', name: 'Text Summarizer', model: 'anthropic/claude-sonnet-4-6', status: 'active', sessions: 8, tokensUsed: '182K', successRate: 94, uptime: '98.7%', lastActive: '5m ago', workspace: '~/.openclaw/workspace' },
  { id: 'agent-03', name: 'Code Reviewer', model: 'anthropic/claude-opus-4-6', status: 'idle', sessions: 3, tokensUsed: '89K', successRate: 98, uptime: '99.8%', lastActive: '1h ago', workspace: '~/.openclaw/workspace' },
  { id: 'agent-04', name: 'Image Analyzer', model: 'anthropic/claude-sonnet-4-6', status: 'active', sessions: 5, tokensUsed: '156K', successRate: 91, uptime: '97.5%', lastActive: '8m ago', workspace: '~/.openclaw/workspace' },
  { id: 'agent-05', name: 'Chat Assistant', model: 'anthropic/claude-haiku-4-5', status: 'stopped', sessions: 0, tokensUsed: '67K', successRate: 89, uptime: '95.1%', lastActive: '3d ago', workspace: '~/.openclaw/workspace' },
  { id: 'agent-06', name: 'Task Scheduler', model: 'anthropic/claude-sonnet-4-6', status: 'active', sessions: 6, tokensUsed: '112K', successRate: 97, uptime: '99.5%', lastActive: '1m ago', workspace: '~/.openclaw/workspace' },
]

export const mockSkills: SkillInfo[] = [
  { id: 'code-interpreter', name: 'Code Interpreter', description: 'Execute Python, Node.js and shell scripts in sandboxed environments', version: '1.2.0', category: 'tool', installed: true, usage: 1842, author: 'OpenClaw', rating: 4.8 },
  { id: 'web-search', name: 'Web Search', description: 'Search the web using Brave, Google or Bing APIs', version: '3.0.1', category: 'api', installed: true, usage: 1523, author: 'OpenClaw', rating: 4.6 },
  { id: 'image-recognition', name: 'Image Recognition', description: 'Analyze and describe images using vision models', version: '2.0.0', category: 'tool', installed: true, usage: 3521, author: 'OpenClaw', rating: 4.9 },
  { id: 'document-parser', name: 'Document Parser', description: 'Parse PDF, DOCX, and other document formats', version: '1.5.2', category: 'tool', installed: true, usage: 892, author: 'Community', rating: 4.3 },
  { id: 'shell-exec', name: 'Shell Executor', description: 'Execute shell commands with configurable timeout and sandboxing', version: '2.1.0', category: 'system', installed: true, usage: 2105, author: 'OpenClaw', rating: 4.7 },
  { id: 'package-manager', name: 'Package Manager', description: 'Install and manage npm, pip packages in agent workspace', version: '1.0.3', category: 'system', installed: false, usage: 450, author: 'Community', rating: 4.1 },
  { id: 'custom-action', name: 'Custom Action Binding', description: 'Create custom Python scripts bound to tool calls', version: '0.9.0', category: 'custom', installed: false, usage: 230, author: 'Community', rating: 3.9 },
]

export const mockSessions: ChatSession[] = [
  { id: 'conv-1', key: 'agent:agent-03:main', title: 'Code Review: Auth Module', agent: 'Code Reviewer', agentId: 'agent-03', lastMessage: 'The authentication flow looks solid...', timestamp: '2m ago', unread: true, kind: 'main', model: 'claude-opus-4-6', contextTokens: 12450, totalTokens: 200000 },
  { id: 'conv-2', key: 'agent:agent-01:main', title: 'Data Analysis Pipeline', agent: 'Data Miner', agentId: 'agent-01', lastMessage: 'I\'ve completed the initial analysis...', timestamp: '15m ago', unread: true, kind: 'main', model: 'claude-opus-4-6', contextTokens: 8200, totalTokens: 200000 },
  { id: 'conv-3', key: 'agent:agent-02:main', title: 'API Documentation', agent: 'Text Summarizer', agentId: 'agent-02', lastMessage: 'Here\'s the summarized API docs...', timestamp: '1h ago', unread: false, kind: 'main', model: 'claude-sonnet-4-6', contextTokens: 5100, totalTokens: 200000 },
  { id: 'conv-4', key: 'agent:agent-04:main', title: 'Image Processing Task', agent: 'Image Analyzer', agentId: 'agent-04', lastMessage: 'The image contains 3 objects...', timestamp: '3h ago', unread: false, kind: 'main', model: 'claude-sonnet-4-6', contextTokens: 3400, totalTokens: 200000 },
  { id: 'conv-5', key: 'agent:agent-06:main', title: 'System Health Check', agent: 'Task Scheduler', agentId: 'agent-06', lastMessage: 'All systems nominal. CPU at 18%...', timestamp: '1d ago', unread: false, kind: 'main', model: 'claude-sonnet-4-6', contextTokens: 1200, totalTokens: 200000 },
]

export const mockSessionMessages: Record<string, ChatMessage[]> = {
  'agent:agent-03:main': [
    { id: 'm1', role: 'user', content: 'Can you review the authentication module in src/auth? I\'m concerned about the token refresh logic.', timestamp: '10:32 AM' },
    { id: 'm2', role: 'assistant', content: 'I\'ll analyze the authentication module now. Let me examine the token refresh implementation.\n\nAfter reviewing `src/auth/token.ts`, I found several observations:\n\n1. **Token Refresh Race Condition**: The current implementation doesn\'t handle concurrent refresh requests. Multiple tabs could trigger simultaneous refreshes.\n\n2. **Expiry Buffer**: The 5-second buffer before expiry is too tight. I recommend 30-60 seconds.\n\n3. **Error Recovery**: The fallback to re-authentication on refresh failure is correct, but the error isn\'t propagated to the UI.\n\nWould you like me to generate a fix for any of these issues?', timestamp: '10:33 AM', agent: 'Code Reviewer', thinking: 'Analyzing src/auth/token.ts → Found refresh logic at line 45 → Checking concurrent request handling → Identified race condition pattern', toolCalls: [{ tool: 'read_file', args: 'src/auth/token.ts', time: '120ms' }, { tool: 'grep', args: 'refreshToken', time: '45ms' }] },
    { id: 'm3', role: 'user', content: 'Yes, please fix the race condition issue. That\'s the most critical one.', timestamp: '10:35 AM' },
    { id: 'm4', role: 'assistant', content: 'I\'ve implemented a mutex-based solution for the token refresh race condition. Here\'s what I changed:\n\n```typescript\nclass TokenManager {\n  private refreshPromise: Promise<Token> | null = null;\n\n  async getValidToken(): Promise<Token> {\n    if (this.isExpiringSoon()) {\n      if (!this.refreshPromise) {\n        this.refreshPromise = this.doRefresh()\n          .finally(() => { this.refreshPromise = null; });\n      }\n      return this.refreshPromise;\n    }\n    return this.currentToken;\n  }\n}\n```\n\nThis ensures only one refresh request runs at a time. All concurrent callers share the same promise. The fix has been applied to `src/auth/token.ts`.', timestamp: '10:36 AM', agent: 'Code Reviewer', thinking: 'Generating mutex pattern → Applying to TokenManager class → Verifying no side effects → Writing to src/auth/token.ts', toolCalls: [{ tool: 'write_file', args: 'src/auth/token.ts', time: '89ms' }] },
  ],
  'agent:agent-01:main': [
    { id: 'dm1', role: 'user', content: 'Summarize the latest anomalies in the ingestion pipeline.', timestamp: '09:10 AM' },
    { id: 'dm2', role: 'assistant', content: 'I found two high-signal anomalies: a 14% drop in completion rate after the schema update and a spike in retry volume for the EU region. The schema update looks like the most likely root cause.', timestamp: '09:12 AM', agent: 'Data Miner' },
  ],
  'agent:agent-02:main': [
    { id: 'ts1', role: 'user', content: 'Turn the API changelog into a short release note.', timestamp: '08:40 AM' },
    { id: 'ts2', role: 'assistant', content: 'Release note draft: improved pagination stability, faster session hydration, and clearer auth error responses. One breaking change: the legacy token endpoint is now deprecated.', timestamp: '08:44 AM', agent: 'Text Summarizer' },
  ],
  'agent:agent-04:main': [
    { id: 'ia1', role: 'user', content: 'Describe what is happening in the attached warehouse image.', timestamp: 'Yesterday' },
    { id: 'ia2', role: 'assistant', content: 'The image shows a warehouse aisle with stacked inventory bins and one worker scanning packages. No obvious safety hazards are visible in the frame.', timestamp: 'Yesterday', agent: 'Image Analyzer' },
  ],
  'agent:agent-06:main': [
    { id: 'hc1', role: 'user', content: 'Run a quick health summary across the system.', timestamp: 'Yesterday' },
    { id: 'hc2', role: 'assistant', content: 'System summary: gateway healthy, 4 of 6 agents active, cron backlog clear, and average response latency is within the normal operating range.', timestamp: 'Yesterday', agent: 'Task Scheduler' },
  ],
}

export const mockMessages: ChatMessage[] = mockSessionMessages['agent:agent-03:main']

export const mockChannels: ChannelInfo[] = [
  { name: 'WhatsApp', provider: 'whatsapp', status: 'connected', dmPolicy: 'pairing' },
  { name: 'Telegram', provider: 'telegram', status: 'connected', accountId: 'bot_12345', dmPolicy: 'allowlist' },
  { name: 'Discord', provider: 'discord', status: 'disconnected', dmPolicy: 'open' },
  { name: 'iMessage', provider: 'imessage', status: 'connected', dmPolicy: 'allowlist' },
  { name: 'Slack', provider: 'slack', status: 'not configured' },
  { name: 'Signal', provider: 'signal', status: 'not configured' },
  { name: 'Google Chat', provider: 'googlechat', status: 'not configured' },
  { name: 'Mattermost', provider: 'mattermost', status: 'not configured' },
]

export const mockCronJobs: CronJob[] = [
  { id: 'cron-daily-report', name: 'Daily Report', schedule: '0 9 * * *', scheduleType: 'cron', agentId: 'agent-01', enabled: true, lastRun: '2h ago', nextRun: 'Tomorrow 9:00 AM', status: 'ok', description: 'Generate daily analytics summary', sessionTarget: 'isolated' },
  { id: 'cron-health-check', name: 'Health Check', schedule: '*/30 * * * *', scheduleType: 'cron', agentId: 'agent-06', enabled: true, lastRun: '12m ago', nextRun: '18 minutes', status: 'ok', description: 'Run system health diagnostics', sessionTarget: 'main' },
  { id: 'cron-cleanup', name: 'Session Cleanup', schedule: '0 2 * * *', scheduleType: 'cron', agentId: 'agent-06', enabled: false, lastRun: '2d ago', nextRun: 'Disabled', status: 'pending', description: 'Prune expired sessions and logs', sessionTarget: 'isolated' },
  { id: 'cron-backup', name: 'Config Backup', schedule: '0 0 * * 0', scheduleType: 'cron', agentId: 'agent-06', enabled: true, lastRun: '5d ago', nextRun: 'Sunday 12:00 AM', status: 'ok', description: 'Weekly configuration backup', sessionTarget: 'isolated' },
]

export const mockDevices: BrowserDeviceInfo[] = [
  {
    id: 'browser-device-a1f3',
    label: 'MacBook Safari',
    platform: 'browser / macOS',
    trust: 'paired',
    origin: 'https://control.example.com',
    lastSeen: '2m ago',
    authMode: 'device-token',
  },
  {
    id: 'browser-device-b924',
    label: 'Remote Chrome',
    platform: 'browser / Windows',
    trust: 'pending',
    origin: 'https://ops.example.net',
    lastSeen: 'Just now',
    authMode: 'shared-token',
  },
  {
    id: 'browser-device-c0d1',
    label: 'Old iPad UI',
    platform: 'browser / iPadOS',
    trust: 'revoked',
    origin: 'https://tablet.example.org',
    lastSeen: '3d ago',
    authMode: 'device-token',
  },
]

export const mockApprovalRequests: ApprovalRequestInfo[] = [
  {
    id: 'approval-exec-01',
    agent: 'Code Reviewer',
    scope: 'shell.exec',
    summary: 'Run `npm test` inside the project workspace',
    status: 'pending',
    requestedAt: '1m ago',
    requestedBy: 'agent-03',
    risk: 'medium',
  },
  {
    id: 'approval-exec-02',
    agent: 'Task Scheduler',
    scope: 'filesystem.write',
    summary: 'Write rotated health summary to ~/.openclaw/reports',
    status: 'approved',
    requestedAt: '18m ago',
    requestedBy: 'agent-06',
    risk: 'low',
  },
  {
    id: 'approval-exec-03',
    agent: 'Data Miner',
    scope: 'network.http',
    summary: 'Call a third-party analytics endpoint from a remote node',
    status: 'denied',
    requestedAt: 'Yesterday',
    requestedBy: 'agent-01',
    risk: 'high',
  },
]

export const mockSystemStatus = {
  version: '1.0.2',
  uptime: '3d 14h 22m',
  cpu: 18,
  memory: 42,
  networkLatency: 35,
  totalAgents: 6,
  activeAgents: 4,
  activeSessions: 3,
  skillsDeployed: 27,
  gatewayPort: 18789,
  bindMode: 'loopback',
  authMode: 'token',
}

export const mockTerminalLogs = [
  { time: '10:32:01', level: 'info' as const, msg: '[gateway] WebSocket connection established from 127.0.0.1' },
  { time: '10:32:01', level: 'info' as const, msg: '[gateway] Client authenticated: openclaw-web-ui (operator)' },
  { time: '10:32:05', level: 'info' as const, msg: '[agent:code-reviewer] Session started: agent:code-reviewer:main' },
  { time: '10:32:06', level: 'debug' as const, msg: '[agent:code-reviewer] Reading file: src/auth/token.ts (2.3KB)' },
  { time: '10:32:08', level: 'info' as const, msg: '[agent:code-reviewer] Tool call: read_file completed in 120ms' },
  { time: '10:32:10', level: 'debug' as const, msg: '[agent:code-reviewer] Tool call: grep "refreshToken" (45ms)' },
  { time: '10:32:15', level: 'info' as const, msg: '[agent:code-reviewer] Response generated: 245 tokens' },
  { time: '10:33:20', level: 'info' as const, msg: '[agent:code-reviewer] Tool call: write_file src/auth/token.ts (89ms)' },
  { time: '10:33:22', level: 'warn' as const, msg: '[channels:whatsapp] Health check: 3200ms response time (threshold: 5000ms)' },
  { time: '10:33:25', level: 'info' as const, msg: '[gateway] Tick: 6 agents, 3 active sessions, CPU 18%' },
]
