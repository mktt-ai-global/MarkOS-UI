import {
  mockAgents,
  mockChannels,
  mockMessages,
  mockNodes,
  mockSessions,
  mockSkills,
  mockSystemStatus,
  type AgentInfo,
  type ChannelInfo,
  type ChatMessage,
  type ChatSession,
  type DeviceNode,
  type SkillInfo,
} from './mock-data.ts'
import { isRecord } from './utils.ts'

type UnknownRecord = Record<string, unknown>

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function unwrapValue(value: unknown): unknown {
  if (!isRecord(value)) return value

  for (const key of ['payload', 'data', 'result']) {
    if (key in value) {
      return value[key]
    }
  }

  return value
}

function findArray(value: unknown, keys: string[]): unknown[] {
  const unwrapped = unwrapValue(value)
  if (Array.isArray(unwrapped)) return unwrapped
  if (!isRecord(unwrapped)) return []

  for (const key of keys) {
    const candidate = unwrapped[key]
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  return []
}

function getValue(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      return record[key]
    }
  }

  return undefined
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return fallback
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}

function normalizeNodeStatus(record: UnknownRecord): DeviceNode['status'] {
  const rawStatus = asString(getValue(record, ['status', 'state']), '').toLowerCase()
  const connected = asBoolean(getValue(record, ['connected', 'online', 'healthy']), false)

  if (connected || rawStatus.includes('online') || rawStatus.includes('connected') || rawStatus.includes('healthy')) {
    return 'Online'
  }
  if (rawStatus.includes('idle') || rawStatus.includes('sleep')) {
    return 'Idle'
  }
  return 'Offline'
}

function normalizeNodeType(record: UnknownRecord): DeviceNode['type'] {
  const rawType = asString(getValue(record, ['type', 'kind', 'deviceType', 'platform']), '').toLowerCase()

  if (rawType.includes('phone') || rawType.includes('mobile') || rawType.includes('ios') || rawType.includes('android')) {
    return 'mobile'
  }
  if (rawType.includes('compute') || rawType.includes('worker')) {
    return 'compute'
  }
  return 'server'
}

function normalizeAgentStatus(value: unknown): AgentInfo['status'] {
  const rawStatus = asString(value, '').toLowerCase()

  if (rawStatus.includes('run') || rawStatus.includes('active') || rawStatus.includes('online') || rawStatus.includes('busy')) {
    return 'active'
  }
  if (rawStatus.includes('idle') || rawStatus.includes('paused') || rawStatus.includes('waiting')) {
    return 'idle'
  }
  return 'stopped'
}

function normalizeSkillCategory(record: UnknownRecord): SkillInfo['category'] {
  const rawCategory = asString(getValue(record, ['category', 'kind', 'type']), '').toLowerCase()
  const name = asString(getValue(record, ['name', 'id']), '').toLowerCase()
  const source = asString(getValue(record, ['source']), '').toLowerCase()
  const groupLabel = asString(getValue(record, ['_groupLabel']), '').toLowerCase()

  if (rawCategory === 'tool' || rawCategory === 'api' || rawCategory === 'custom' || rawCategory === 'system') {
    return rawCategory
  }
  if (source === 'plugin' || groupLabel.includes('plugin')) return 'custom'
  if (name.includes('api') || name.includes('search') || name.includes('web') || groupLabel.includes('web')) return 'api'
  if (name.includes('exec') || name.includes('process') || groupLabel.includes('runtime')) return 'system'
  return 'tool'
}

function normalizeTextContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part
        if (isRecord(part)) return asString(getValue(part, ['text', 'content', 'value']))
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (isRecord(value)) {
    return asString(getValue(value, ['text', 'content', 'value']))
  }
  return ''
}

export function buildActivitySeries(seed: string, points = 16): { h: string; v: number }[] {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 9973
  }

  return Array.from({ length: points }, (_, index) => ({
    h: `${index}`,
    v: 24 + ((hash + index * 17) % 65),
  }))
}

export function buildPerformanceSeries(totalAgents: number, activeSessions: number, skillsCount: number) {
  const baselineAgents = Math.max(totalAgents, 1)
  const baselineTokens = Math.max((activeSessions + skillsCount) * 2200, 12000)

  return Array.from({ length: 7 }, (_, index) => ({
    day: `${index + 1}`.padStart(2, '0'),
    agents: Math.max(1, baselineAgents - 2 + ((index * 3 + skillsCount) % 5)),
    tokens: baselineTokens + index * 1800 + ((baselineAgents + index) % 4) * 900,
  }))
}

export function buildAgentPerformanceSeries(agentId: string, sessions: number) {
  return Array.from({ length: 14 }, (_, index) => ({
    d: `${index + 1}`,
    calls: Math.max(20, sessions * 8 + ((index + agentId.length) % 5) * 9 + index * 2),
  }))
}

function formatTimestamp(value: unknown): string {
  if (typeof value === 'string' && value) return value
  if (typeof value === 'number' && value > 0) {
    const date = new Date(value)
    const now = Date.now()
    const diffMs = now - value
    if (diffMs < 60000) return 'Just now'
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return 'Recently'
}

function parseAgentIdFromKey(key: string): string {
  // key format: "agent:<agentId>:<rest>"
  const parts = key.split(':')
  if (parts[0] === 'agent' && parts.length >= 2) return parts[1]
  return ''
}

export function normalizeSessions(raw: unknown, fallback: ChatSession[] = mockSessions, isLive = false): ChatSession[] {
  const items = findArray(raw, ['sessions', 'items', 'list', 'results'])
  const normalized = items
    .map((item, index) => {
      if (!isRecord(item)) return null

      const usage = isRecord(item.usage) ? item.usage : null
      const id = asString(getValue(item, ['id', 'sessionId', 'key']), `session-${index + 1}`)
      const key = asString(getValue(item, ['key', 'sessionKey', 'id']), id)
      const keyAgentId = parseAgentIdFromKey(key)
      const agentId = asString(getValue(item, ['agentId', 'agent_id', 'agent']), keyAgentId || `agent-${index + 1}`)
      const displayName = asString(getValue(item, ['displayName', 'title', 'name', 'label', 'subject']), '')
      const agent = asString(getValue(item, ['agent', 'agentName']), agentId)
      const title = displayName || agent || agentId
      const lastMessage = asString(getValue(item, ['lastMessage', 'preview', 'snippet']), '')
      const rawUpdatedAt = getValue(item, ['timestamp', 'updatedAt', 'lastMessageAt', 'createdAt'])
      const timestamp = formatTimestamp(rawUpdatedAt)
      const rawKind = asString(getValue(item, ['kind', 'type']), 'main')
      const kind: ChatSession['kind'] =
        rawKind === 'group' || rawKind === 'cron' || rawKind === 'hook' || rawKind === 'node' ? rawKind : 'main'

      const modelProvider = asString(getValue(item, ['modelProvider']), '')
      const model = asString(getValue(item, ['model', 'modelId', 'providerModel']), 'unknown')
      const fullModel = modelProvider ? `${modelProvider}/${model}` : model

      return {
        id,
        key,
        title,
        agent,
        agentId,
        lastMessage: lastMessage || `${asString(getValue(item, ['status']), 'idle')} · ${fullModel}`,
        timestamp,
        unread: asBoolean(getValue(item, ['unread', 'hasUnread']), false),
        kind,
        model: fullModel,
        contextTokens: asNumber(getValue(item, ['contextTokens', 'tokenCount', 'tokens', 'promptTokens'])) || asNumber(usage?.promptTokens),
        totalTokens: asNumber(getValue(item, ['totalTokens', 'maxContextTokens', 'contextWindow']), 200000) || 200000,
      }
    })
    .filter((item): item is ChatSession => item !== null)

  return (normalized.length > 0 || isLive) ? normalized : fallback
}

export function normalizeMessages(raw: unknown, fallback: ChatMessage[] = mockMessages, isLive = false): ChatMessage[] {
  const items = findArray(raw, ['messages', 'items', 'list', 'history', 'results'])
  const normalized: ChatMessage[] = []

  for (const [index, item] of items.entries()) {
    if (!isRecord(item)) continue

    const rawRole = asString(getValue(item, ['role', 'sender', 'author']), 'assistant').toLowerCase()
    const role: ChatMessage['role'] =
      rawRole === 'user' || rawRole === 'system' ? rawRole : 'assistant'

    const toolCallItems: NonNullable<ChatMessage['toolCalls']> = []
    for (const toolCall of toArray(getValue(item, ['toolCalls', 'tool_calls', 'tools']))) {
      if (!isRecord(toolCall)) continue

      toolCallItems.push({
        tool: asString(getValue(toolCall, ['tool', 'name']), 'tool'),
        args: normalizeTextContent(getValue(toolCall, ['args', 'arguments', 'input'])) || '{}',
        time: asString(getValue(toolCall, ['time', 'duration']), ''),
      })
    }

    const agent = asString(getValue(item, ['agent', 'agentName']), '')
    const thinking = normalizeTextContent(getValue(item, ['thinking', 'reasoning']))

    normalized.push({
      id: asString(getValue(item, ['id', 'messageId']), `message-${index + 1}`),
      role,
      content: normalizeTextContent(getValue(item, ['content', 'text', 'body'])) || '[empty message]',
      timestamp: asString(getValue(item, ['timestamp', 'createdAt', 'updatedAt']), 'Recently'),
      agent: agent || undefined,
      thinking: thinking || undefined,
      toolCalls: toolCallItems.length > 0 ? toolCallItems : undefined,
    })
  }

  return (normalized.length > 0 || isLive) ? normalized : fallback
}

export function normalizeNodes(raw: unknown, fallback: DeviceNode[] = mockNodes, isLive = false): DeviceNode[] {
  const items = findArray(raw, ['nodes', 'items', 'list', 'results'])
  const normalized: DeviceNode[] = []

  for (const item of items) {
    if (!isRecord(item)) continue

    const metrics = isRecord(getValue(item, ['metrics'])) ? getValue(item, ['metrics']) as UnknownRecord : null
    const cpu = asNumber(getValue(item, ['cpu', 'cpuUsage']), asNumber(metrics?.cpu))
    const mem = asNumber(getValue(item, ['mem', 'memory', 'memoryUsage']), asNumber(metrics?.memory))
    const disk = asNumber(getValue(item, ['disk', 'diskUsage']), asNumber(metrics?.disk))
    const ip = asString(getValue(item, ['ip', 'address', 'host']), '')

    normalized.push({
      name: asString(getValue(item, ['name', 'label', 'hostname', 'id']), 'Unknown Node'),
      type: normalizeNodeType(item),
      status: normalizeNodeStatus(item),
      cpu,
      mem,
      disk,
      ip: ip || undefined,
    })
  }

  return (normalized.length > 0 || isLive) ? normalized : fallback
}

export function normalizePresence(
  raw: unknown,
  sessions: ChatSession[],
  skills: SkillInfo[],
  fallback = mockSystemStatus,
) {
  const unwrapped = unwrapValue(raw)

  // system-presence returns an array of connected clients/nodes.
  // Extract the gateway entry (mode === 'gateway') for version/platform info.
  const presenceItems = Array.isArray(unwrapped) ? unwrapped : []
  const gatewayEntry = presenceItems.find(
    (item) => isRecord(item) && asString(getValue(item, ['mode'])) === 'gateway',
  )
  const gatewayRecord = isRecord(gatewayEntry) ? gatewayEntry : {}

  // Count connected clients (non-gateway entries)
  const clientEntries = presenceItems.filter(
    (item) => isRecord(item) && asString(getValue(item, ['mode'])) !== 'gateway',
  )

  // If it was already an object (fallback/mock), use the old path
  const record = isRecord(unwrapped) ? unwrapped : gatewayRecord

  // For object format (mock/legacy): extract agent counts from nested arrays
  const objectAgentItems = findArray(record, ['agents', 'workers', 'operators'])
  const objectTotalAgents = asNumber(getValue(record, ['totalAgents', 'agentCount']),
    presenceItems.length > 0 ? clientEntries.length : objectAgentItems.length || fallback.totalAgents)
  const objectActiveAgents = asNumber(getValue(record, ['activeAgents', 'runningAgents']),
    presenceItems.length > 0 ? clientEntries.length :
    objectAgentItems.filter((item) => isRecord(item) && normalizeAgentStatus(getValue(item, ['status', 'state'])) === 'active').length || fallback.activeAgents)

  return {
    version: asString(getValue(record, ['version']), fallback.version),
    uptime: asString(getValue(record, ['uptime']), fallback.uptime),
    cpu: asNumber(getValue(record, ['cpu', 'cpuUsage']), fallback.cpu),
    memory: asNumber(getValue(record, ['memory', 'mem', 'memoryUsage']), fallback.memory),
    networkLatency: asNumber(getValue(record, ['networkLatency', 'latency', 'ping']), fallback.networkLatency),
    totalAgents: objectTotalAgents,
    activeAgents: objectActiveAgents,
    activeSessions: sessions.length || fallback.activeSessions,
    skillsDeployed: skills.length || fallback.skillsDeployed,
    gatewayPort: asNumber(getValue(record, ['gatewayPort', 'port']), fallback.gatewayPort),
    bindMode: asString(getValue(record, ['bindMode', 'bindAddress']), fallback.bindMode),
    authMode: asString(getValue(record, ['authMode', 'auth']), fallback.authMode),
  }
}

export function normalizeAgents(
  agentsRaw: unknown,
  sessions: ChatSession[],
  fallback: AgentInfo[] = mockAgents,
  isLive = false,
): AgentInfo[] {
  // Extract known agent IDs from agents.list ({ agents: [{id}] })
  const unwrapped = unwrapValue(agentsRaw)
  const knownAgentIds = new Set<string>()
  if (isRecord(unwrapped) && Array.isArray(unwrapped.agents)) {
    for (const item of unwrapped.agents as unknown[]) {
      if (isRecord(item)) {
        const id = asString(getValue(item, ['id']))
        if (id) knownAgentIds.add(id)
      }
    }
  }

  const fallbackById = new Map(fallback.map((agent) => [agent.id, agent]))

  // Build agents from sessions (which have model, tokens, timestamps, etc.)
  const grouped = new Map<string, AgentInfo>()
  // Track raw token counts so we don't round-trip through compactNumber strings
  const rawTokensByAgent = new Map<string, number>()
  for (const session of sessions) {
    const fallbackAgent = fallbackById.get(session.agentId)
    const existing = grouped.get(session.agentId)

    if (existing) {
      existing.sessions += 1
      const prev = rawTokensByAgent.get(session.agentId) ?? 0
      const next = prev + session.contextTokens
      rawTokensByAgent.set(session.agentId, next)
      existing.tokensUsed = compactNumber(next)
      existing.lastActive = session.timestamp
      continue
    }

    const initialTokens = Math.max(session.contextTokens, 0)
    rawTokensByAgent.set(session.agentId, initialTokens)

    grouped.set(session.agentId, {
      id: session.agentId,
      name: session.agent || fallbackAgent?.name || session.agentId,
      model: session.model || fallbackAgent?.model || 'unknown',
      status: 'active',
      sessions: 1,
      tokensUsed: compactNumber(initialTokens),
      successRate: fallbackAgent?.successRate ?? 94,
      uptime: fallbackAgent?.uptime ?? 'Active',
      lastActive: session.timestamp,
      workspace: fallbackAgent?.workspace ?? '~/.openclaw/workspace',
      identity: fallbackAgent?.identity,
    })
  }

  // Add agents from agents.list that have no sessions yet
  for (const agentId of knownAgentIds) {
    if (!grouped.has(agentId)) {
      const fallbackAgent = fallbackById.get(agentId)
      grouped.set(agentId, {
        id: agentId,
        name: fallbackAgent?.name || agentId,
        model: fallbackAgent?.model || 'unknown',
        status: 'idle',
        sessions: 0,
        tokensUsed: '0',
        successRate: fallbackAgent?.successRate ?? 0,
        uptime: fallbackAgent?.uptime ?? 'Unknown',
        lastActive: 'No sessions',
        workspace: fallbackAgent?.workspace ?? '~/.openclaw/workspace',
        identity: fallbackAgent?.identity,
      })
    }
  }

  return (grouped.size > 0 || isLive) ? Array.from(grouped.values()) : fallback
}

export function normalizeSkills(
  skillsBinsRaw: unknown,
  toolsCatalogRaw: unknown,
  fallback: SkillInfo[] = mockSkills,
): SkillInfo[] {
  const byId = new Map<string, SkillInfo>()

  const mergeSkill = (record: UnknownRecord, installedHint: boolean) => {
    const id = asString(getValue(record, ['id', 'name', 'slug']), '').toLowerCase().replace(/\s+/g, '-')
    if (!id) return

    const fallbackSkill = fallback.find((skill) => skill.id === id || skill.name.toLowerCase() === asString(getValue(record, ['name']), '').toLowerCase())
    const previous = byId.get(id)

    byId.set(id, {
      id,
      name: asString(getValue(record, ['name', 'label', 'title']), previous?.name ?? fallbackSkill?.name ?? id),
      description: asString(getValue(record, ['description', 'summary']), previous?.description ?? fallbackSkill?.description ?? 'No description available'),
      version: asString(getValue(record, ['version', 'currentVersion']), previous?.version ?? fallbackSkill?.version ?? '1.0.0'),
      category: normalizeSkillCategory(record),
      installed: installedHint || asBoolean(getValue(record, ['installed', 'enabled']), previous?.installed ?? fallbackSkill?.installed ?? false),
      usage: asNumber(getValue(record, ['usage', 'useCount', 'calls']), previous?.usage ?? fallbackSkill?.usage ?? 0),
      author: asString(getValue(record, ['author', 'publisher']), previous?.author ?? fallbackSkill?.author ?? 'OpenClaw'),
      rating: asNumber(getValue(record, ['rating', 'score']), previous?.rating ?? fallbackSkill?.rating ?? 4.5),
    })
  }

  for (const item of findArray(skillsBinsRaw, ['bins', 'skills', 'items', 'list'])) {
    if (isRecord(item)) {
      mergeSkill(item, true)
    }
  }

  // tools.catalog returns { groups: [{ label, tools: [{ id, label, description, source }] }] }
  const catalogUnwrapped = unwrapValue(toolsCatalogRaw)
  const catalogRecord = isRecord(catalogUnwrapped) ? catalogUnwrapped : null
  const catalogGroups = catalogRecord ? findArray(catalogRecord, ['groups']) : []
  const isLiveCatalog = catalogRecord !== null && 'groups' in catalogRecord

  if (catalogGroups.length > 0) {
    for (const group of catalogGroups) {
      if (!isRecord(group)) continue
      const groupLabel = asString(getValue(group, ['label', 'name']), '')
      for (const tool of toArray(group.tools)) {
        if (!isRecord(tool)) continue
        const enriched = { ...tool, _groupLabel: groupLabel }
        mergeSkill(enriched as UnknownRecord, true)
      }
    }
  } else if (!isLiveCatalog) {
    for (const item of findArray(toolsCatalogRaw, ['tools', 'items', 'list', 'catalog'])) {
      if (isRecord(item)) {
        mergeSkill(item, false)
      }
    }
  }

  // If we received a live response (has groups key), trust the result even if empty
  if (isLiveCatalog) return Array.from(byId.values())
  return byId.size > 0 ? Array.from(byId.values()) : fallback
}

export function normalizeChannels(raw: unknown, fallback: ChannelInfo[] = mockChannels, isLive = false): ChannelInfo[] {
  const items = findArray(raw, ['channels', 'items', 'list', 'results'])
  const normalized: ChannelInfo[] = []

  for (const item of items) {
    if (!isRecord(item)) continue

    const provider = asString(getValue(item, ['provider', 'type', 'id', 'name']), '')
    const name = asString(getValue(item, ['name', 'label', 'provider']), provider || 'Channel')
    const rawStatus = asString(getValue(item, ['status', 'state', 'health']), '').toLowerCase()
    const status: ChannelInfo['status'] =
      rawStatus.includes('connect') || rawStatus === 'ok' || rawStatus === 'healthy'
        ? 'connected'
        : rawStatus.includes('config')
          ? 'not configured'
          : rawStatus.includes('error') || rawStatus.includes('fail')
            ? 'error'
            : 'disconnected'
    const accountId = asString(getValue(item, ['accountId', 'account', 'botId']), '')
    const dmPolicy = asString(getValue(item, ['dmPolicy', 'policy', 'mode']), '')

    normalized.push({
      name,
      provider: provider || name.toLowerCase().replace(/\s+/g, ''),
      status,
      accountId: accountId || undefined,
      dmPolicy: dmPolicy || undefined,
    })
  }

  return (normalized.length > 0 || isLive) ? normalized : fallback
}
