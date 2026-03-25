import { mockSessionMessages, mockSessions, type ChatMessage, type ChatSession } from './mock-data.ts'
import { canUseStorage, isRecord } from './utils.ts'

export interface SessionOverrideDraft {
  model: string
  maxTokens: string
  toolMode: string
  notes: string
}

export interface LiveRunItem {
  id: string
  sessionKey: string
  kind: 'status' | 'partial' | 'tool' | 'event'
  label: string
  detail: string
  timestamp: string
  eventName: string
}

export interface ChatPreviewState {
  activeConvKey: string
  offlineSessions: ChatSession[]
  offlineMessagesBySession: Record<string, ChatMessage[]>
  sessionOverridesByKey: Record<string, SessionOverrideDraft>
  liveRunItemsBySession: Record<string, LiveRunItem[]>
}

const CHAT_PREVIEW_STATE_KEY = 'openclaw_ui_chat_preview_state_v1'

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isChatSession(value: unknown): value is ChatSession {
  return isRecord(value) &&
    ['main', 'group', 'cron', 'hook', 'node'].includes(value.kind as string) &&
    typeof value.contextTokens === 'number' &&
    typeof value.totalTokens === 'number' &&
    typeof value.unread === 'boolean' &&
    [
      'id',
      'key',
      'title',
      'agent',
      'agentId',
      'lastMessage',
      'timestamp',
      'model',
    ].every((field) => isString(value[field]))
}

function isToolCall(value: unknown): value is NonNullable<ChatMessage['toolCalls']>[number] {
  return isRecord(value) &&
    isString(value.tool) &&
    isString(value.args) &&
    isString(value.time)
}

function isChatMessage(value: unknown): value is ChatMessage {
  return isRecord(value) &&
    ['user', 'assistant', 'system'].includes(value.role as string) &&
    isString(value.id) &&
    isString(value.content) &&
    isString(value.timestamp) &&
    (value.agent === undefined || isString(value.agent)) &&
    (value.thinking === undefined || isString(value.thinking)) &&
    (value.toolCalls === undefined || (Array.isArray(value.toolCalls) && value.toolCalls.every(isToolCall)))
}

function isSessionOverrideDraft(value: unknown): value is SessionOverrideDraft {
  return isRecord(value) &&
    isString(value.model) &&
    isString(value.maxTokens) &&
    isString(value.toolMode) &&
    isString(value.notes)
}

function isLiveRunItem(value: unknown): value is LiveRunItem {
  return isRecord(value) &&
    ['status', 'partial', 'tool', 'event'].includes(value.kind as string) &&
    [
      'id',
      'sessionKey',
      'label',
      'detail',
      'timestamp',
      'eventName',
    ].every((field) => isString(value[field]))
}

function sanitizeMessagesBySession(value: unknown): Record<string, ChatMessage[]> {
  if (!isRecord(value)) return {}

  const next: Record<string, ChatMessage[]> = {}
  for (const [key, messages] of Object.entries(value)) {
    if (!Array.isArray(messages)) continue
    next[key] = messages.filter(isChatMessage)
  }
  return next
}

function sanitizeOverrides(value: unknown): Record<string, SessionOverrideDraft> {
  if (!isRecord(value)) return {}

  const next: Record<string, SessionOverrideDraft> = {}
  for (const [key, draft] of Object.entries(value)) {
    if (isSessionOverrideDraft(draft)) {
      next[key] = draft
    }
  }
  return next
}

function sanitizeLiveRunItems(value: unknown): Record<string, LiveRunItem[]> {
  if (!isRecord(value)) return {}

  const next: Record<string, LiveRunItem[]> = {}
  for (const [key, items] of Object.entries(value)) {
    if (!Array.isArray(items)) continue
    next[key] = items.filter(isLiveRunItem)
  }
  return next
}

export function createDefaultChatPreviewState(): ChatPreviewState {
  return {
    activeConvKey: mockSessions[0]?.key || 'local:session:default',
    offlineSessions: structuredClone(mockSessions),
    offlineMessagesBySession: structuredClone(mockSessionMessages),
    sessionOverridesByKey: {},
    liveRunItemsBySession: {},
  }
}

export function loadChatPreviewState(): ChatPreviewState {
  const fallback = createDefaultChatPreviewState()
  if (!canUseStorage()) return fallback

  try {
    const raw = window.localStorage.getItem(CHAT_PREVIEW_STATE_KEY)
    if (!raw) return fallback

    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return fallback

    return {
      activeConvKey: isString(parsed.activeConvKey) ? parsed.activeConvKey : fallback.activeConvKey,
      offlineSessions: Array.isArray(parsed.offlineSessions)
        ? parsed.offlineSessions.filter(isChatSession)
        : fallback.offlineSessions,
      offlineMessagesBySession: sanitizeMessagesBySession(parsed.offlineMessagesBySession),
      sessionOverridesByKey: sanitizeOverrides(parsed.sessionOverridesByKey),
      liveRunItemsBySession: sanitizeLiveRunItems(parsed.liveRunItemsBySession),
    }
  } catch {
    return fallback
  }
}

export function persistChatPreviewState(state: ChatPreviewState) {
  if (!canUseStorage()) return
  window.localStorage.setItem(CHAT_PREVIEW_STATE_KEY, JSON.stringify(state))
}
