import { useState } from 'react'
import {
  Server,
  Smartphone,
  HardDrive,
  Activity,
  Zap,
  Clock,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import {
  buildActivitySeries,
  buildPerformanceSeries,
  normalizeAgents,
  normalizeNodes,
  normalizePresence,
  normalizeSessions,
  normalizeSkills,
} from '../lib/openclaw-adapters'
import { useGatewayData } from '../hooks/useOpenClaw'
import { mockNodes, mockSessions, mockSkills, mockSystemStatus } from '../lib/mock-data'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar } from 'recharts'

const statusColor: Record<string, string> = {
  Online: 'bg-success',
  Offline: 'bg-text-tertiary',
  Idle: 'bg-warning',
  Running: 'bg-info',
}

function BarIndicator({ value, color = 'bg-accent' }: { value: number; color?: string }) {
  return (
    <div className="h-1 w-full bg-[var(--color-glass-border)] rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
    </div>
  )
}

export default function Dashboard() {
  const [nodeFilter, setNodeFilter] = useState<'all' | 'online'>('all')
  const { data: nodesRaw, isLive: nodesLive } = useGatewayData<unknown>('node.list', {}, mockNodes, 15000)
  const { data: sessionsRaw, isLive: sessionsLive } = useGatewayData<unknown>('sessions.list', {}, mockSessions, 10000)
  const { data: skillsBinsRaw, isLive: skillsBinsLive } = useGatewayData<unknown>('skills.bins', {}, mockSkills, 15000)
  const { data: toolsCatalogRaw, isLive: toolsCatalogLive } = useGatewayData<unknown>('tools.catalog', {}, mockSkills, 15000)
  const { data: presenceRaw, isLive: presenceLive } = useGatewayData<unknown>('system-presence', {}, mockSystemStatus, 10000)

  const sessions = normalizeSessions(sessionsRaw, mockSessions)
  const skills = normalizeSkills(skillsBinsRaw, toolsCatalogRaw, mockSkills)
  const presence = normalizePresence(presenceRaw, sessions, skills, mockSystemStatus)
  const devices = normalizeNodes(nodesRaw, mockNodes)
  const agents = normalizeAgents(presenceRaw, sessions)
  const performanceData = buildPerformanceSeries(presence.totalAgents, presence.activeSessions, skills.length)
  const activeAgents = agents
    .filter(agent => agent.status !== 'stopped')
    .slice(0, 3)
    .map(agent => ({
      id: agent.id,
      name: agent.name,
      status: agent.status === 'active' ? 'Running' : 'Idle',
      activity: buildActivitySeries(agent.id, 16),
    }))
  const filteredDevices = nodeFilter === 'online'
    ? devices.filter(device => device.status === 'Online')
    : devices
  const topSkills = [...skills]
    .sort((left, right) => right.usage - left.usage)
    .slice(0, 3)
    .map(skill => ({
      name: skill.name,
      version: skill.version,
      usage: Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(skill.usage),
      count: skill.usage,
    }))
  const activeChats = sessions.slice(0, 3).map((session, index) => ({
    id: session.id,
    label: session.agent.slice(0, 2).toUpperCase(),
    color: ['from-blue-400 to-blue-500', 'from-green-400 to-green-500', 'from-amber-400 to-orange-500'][index % 3],
    task: session.title,
    progress: Math.min(100, Math.round((session.contextTokens / Math.max(session.totalTokens, 1)) * 100)),
  }))
  const isLive = nodesLive || sessionsLive || skillsBinsLive || toolsCatalogLive || presenceLive
  const snapshotBadge = (
    <span className={`text-[10px] px-2 py-1 rounded-full ${isLive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
      {isLive ? 'Snapshot' : 'Mock Snapshot'}
    </span>
  )
  const derivedBadge = (
    <span className="text-[10px] px-2 py-1 rounded-full bg-info/10 text-info">
      Derived
    </span>
  )

  return (
    <div className="space-y-3 md:space-y-4 animate-fade-in">
      <div className="rounded-2xl px-4 py-3 text-xs bg-info/10 text-info">
        Dashboard cards marked as derived are front-end estimates built from current snapshot data. Deep agent telemetry and true task progress stay on the TODO list until a local OpenClaw gateway is available for end-to-end validation.
      </div>

      {/* Row 1: Device Overview + Performance + Profile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 md:gap-4">
        {/* Device Overview */}
        <div className="lg:col-span-4">
          <GlassCard
            title="Device Overview"
            action={
              <div className="flex items-center gap-2">
                {snapshotBadge}
                <select
                  value={nodeFilter}
                  onChange={(event) => setNodeFilter(event.target.value as 'all' | 'online')}
                  className="text-xs bg-[var(--color-glass-subtle)] border border-[var(--color-glass-border)] rounded-lg px-2 py-1 text-text-secondary outline-none"
                >
                  <option value="all">All Nodes</option>
                  <option value="online">Online</option>
                </select>
              </div>
            }
          >
            <div className="space-y-3">
              {filteredDevices.map((d) => (
                <div key={d.name} className="glass-subtle p-3 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    {d.type === 'server' ? (
                      <Server size={14} className="text-accent" />
                    ) : (
                      <HardDrive size={14} className="text-accent" />
                    )}
                    <span className="text-xs font-medium text-text-primary">{d.name}</span>
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-text-secondary">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusColor[d.status]}`} />
                      {d.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px] text-text-tertiary">
                    <div>
                      <span>CPU</span>
                      <BarIndicator value={d.cpu} color="bg-success" />
                    </div>
                    <div>
                      <span>Memory</span>
                      <BarIndicator value={d.mem} color="bg-info" />
                    </div>
                    <div>
                      <span>Disk</span>
                      <BarIndicator value={d.disk} color="bg-warning" />
                    </div>
                  </div>
                </div>
              ))}
              {filteredDevices.length === 0 && (
                <div className="text-xs text-text-tertiary text-center py-4">No nodes match the current filter.</div>
              )}
            </div>
            <p className="mt-3 text-[10px] text-text-tertiary">
              Node health bars reflect the latest gateway snapshot when available, otherwise the local fallback dataset.
            </p>
          </GlassCard>
        </div>

        {/* Performance Chart */}
        <div className="lg:col-span-5">
          <GlassCard
            title="OpenClaw Performance"
            action={(
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-1 rounded-full ${isLive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                  {isLive ? 'Live Snapshot' : 'Mock Fallback'}
                </span>
                {derivedBadge}
              </div>
            )}
          >
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Total Agents', value: `${presence.totalAgents}`, icon: Activity },
                { label: 'Active Chats', value: `${presence.activeSessions}`, icon: Zap },
                { label: 'Skills Deployed', value: `${presence.skillsDeployed}`, icon: TrendingUp },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-text-primary">{value}</div>
                  <div className="text-[10px] text-text-tertiary flex items-center justify-center gap-1 mt-0.5">
                    <Icon size={10} />
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <div className="h-28 md:h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="agentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34c759" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#34c759" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#aeaeb2' }} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 12, fontSize: 11 }} />
                  <Area type="monotone" dataKey="agents" stroke="#6366f1" strokeWidth={2} fill="url(#agentGrad)" />
                  <Area type="monotone" dataKey="tokens" stroke="#34c759" strokeWidth={1.5} fill="url(#tokenGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-[10px] text-text-tertiary">
              Trend lines are estimated from gateway totals and recent UI snapshots, not a raw performance timeseries from OpenClaw.
            </p>
          </GlassCard>
        </div>

        {/* Profile Card */}
        <div className="lg:col-span-3">
          <GlassCard title="Gateway Snapshot" action={snapshotBadge} className="text-center">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-light)] mx-auto mb-3 flex items-center justify-center text-white text-lg md:text-xl font-bold shadow-lg">
              OC
            </div>
            <h4 className="text-sm font-semibold text-text-primary">{presence.version}</h4>
            <p className="text-[10px] text-text-tertiary mb-3">{presence.uptime}</p>
            <div className="flex justify-center gap-4 text-[10px]">
              <div>
                <div className="text-sm font-bold text-text-primary">{presence.cpu}%</div>
                <div className="text-text-tertiary">CPU</div>
              </div>
              <div>
                <div className="text-sm font-bold text-text-primary">{presence.memory}%</div>
                <div className="text-text-tertiary">Memory</div>
              </div>
            </div>
            <div className="mt-3 w-20 h-20 mx-auto relative hidden md:block">
              <svg viewBox="0 0 36 36" className="w-full h-full">
                <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-glass-border)" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeDasharray={`${Math.min(Math.max(presence.cpu, 0), 100)} 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-accent">{presence.cpu}</div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Row 2: Active Agents + Agent Reach */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        <div className="lg:col-span-8">
          <GlassCard
            title="Active Agents"
            action={
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary">{presence.activeAgents} active right now</span>
                {derivedBadge}
              </div>
            }
          >
            <div className="space-y-2">
              {activeAgents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--color-glass-hover)] transition-colors cursor-pointer group">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center flex-shrink-0">
                    <Smartphone size={16} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-text-primary truncate">
                      {agent.id.replace('-', ' ').toUpperCase()} - {agent.name}
                    </div>
                    <div className="text-[10px] text-text-tertiary">{agent.id}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    agent.status === 'Running' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                  }`}>
                    {agent.status}
                  </span>
                  {/* Mini sparkline — hidden on mobile */}
                  <div className="w-32 h-8 hidden sm:block flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={agent.activity}>
                        <Bar dataKey="v" fill="#6366f1" opacity={0.4} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ChevronRight size={14} className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hidden sm:block" />
                </div>
              ))}
            </div>
            <p className="mt-3 text-[10px] text-text-tertiary">
              Mini activity bars are UI estimates based on current agent/session visibility, pending real historical activity metrics from the gateway.
            </p>
          </GlassCard>
        </div>

        <div className="lg:col-span-4">
          <GlassCard title="Agent Reach" action={derivedBadge}>
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Agent Managed</span>
                <span className="text-lg font-bold text-text-primary">{presence.totalAgents}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">Latency Score</span>
                <span className="text-lg font-bold text-text-primary">{100 - Math.min(Math.max(presence.networkLatency, 0), 99)}</span>
              </div>
              <div className="h-1.5 w-full bg-[var(--color-glass-border)] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full" style={{ width: `${100 - Math.min(Math.max(presence.networkLatency, 0), 99)}%` }} />
              </div>
              <p className="text-[10px] text-text-tertiary">
                This score is a UI convenience derived from reported latency, not an official OpenClaw metric.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Row 3: Run Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        <GlassCard title="Skills (Overview)" action={snapshotBadge}>
          <div className="space-y-3">
            {topSkills.map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary">{s.name}</div>
                  <div className="text-[10px] text-text-tertiary">Version: {s.version}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-semibold text-text-primary">{s.usage}</div>
                  <div className="text-[10px] text-text-tertiary">{s.count} usage</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-text-tertiary">
            Usage totals come from the current skill catalog snapshot. They are not historical trend lines.
          </p>
        </GlassCard>

        <GlassCard title="Chat (Context Snapshot)" action={snapshotBadge}>
          <div className="space-y-3">
            {activeChats.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${c.color} flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                  {c.label}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">
                    Session ID: {c.id}
                  </div>
                  <div className="text-[10px] text-text-tertiary">
                    {c.task} · context usage {c.progress}%
                  </div>
                </div>
              </div>
            ))}
            {activeChats.length === 0 && (
              <div className="text-xs text-text-tertiary text-center py-3">No active sessions reported.</div>
            )}
          </div>
          <p className="mt-3 text-[10px] text-text-tertiary">
            Context usage is calculated directly from each visible session's reported token window.
          </p>
        </GlassCard>

        <GlassCard title="Settings (Key Configs)" action={snapshotBadge} className="md:col-span-2 lg:col-span-1">
          <div className="space-y-2.5">
            {[
              `Bind Mode: ${presence.bindMode}`,
              `Auth Mode: ${presence.authMode}`,
              `Gateway Port: ${presence.gatewayPort}`,
              `Latency: ${presence.networkLatency}ms`,
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-text-secondary hover:text-accent cursor-pointer transition-colors py-1">
                <Clock size={12} className="text-text-tertiary" />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-text-tertiary">
            These are reported values from the gateway presence snapshot, not editable settings in this page.
          </p>
        </GlassCard>
      </div>
    </div>
  )
}
