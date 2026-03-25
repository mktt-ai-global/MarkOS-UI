import { useEffect, useRef, useState } from 'react'
import {
  Send, Plus, Search, MoreHorizontal, Bot, User, Sparkles,
  ArrowRight, Paperclip, Copy, Eye,
  Square, Trash2,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { useGatewayData, useGatewayAction, useConnectionStatus, useOpenClawEvent } from '../hooks/useOpenClaw'
import { copyTextToClipboard } from '../lib/clipboard'
import { normalizeMessages, normalizeSessions } from '../lib/openclaw-adapters'
import { mockSessions, type ChatSession, type ChatMessage } from '../lib/mock-data'
import { openclawClient } from '../lib/openclaw-client'
import {
  loadAgentDrafts,
  loadSkillDrafts,
  subscribeAgentDrafts,
  subscribeSkillDrafts,
  type LocalAgentDraft,
  type LocalSkillDraft,
} from '../lib/draft-storage'
import {
  loadChatPreviewState,
  persistChatPreviewState,
  type LiveRunItem,
  type SessionOverrideDraft,
} from '../lib/chat-preview-storage'

type UnknownRecord = Record<string, unknown>

function nextLocalMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-${crypto.randomUUID()}`
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createTimestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function toPreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 72) || 'No messages yet'
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createSessionOverrideDraft(session?: ChatSession): SessionOverrideDraft {
  return {
    model: session?.model || '',
    maxTokens: session ? `${session.totalTokens}` : '',
    toolMode: 'inherit',
    notes: '',
  }
}

function valuesDiffer(left: string, right: string): boolean {
  return left.trim() !== right.trim()
}

function countOverrideChanges(base: SessionOverrideDraft, current: SessionOverrideDraft): number {
  return (
    Number(valuesDiffer(base.model, current.model)) +
    Number(valuesDiffer(base.maxTokens, current.maxTokens)) +
    Number(valuesDiffer(base.toolMode, current.toolMode)) +
    Number(valuesDiffer(base.notes, current.notes))
  )
}

function getEventSessionKey(event: { payload: Record<string, unknown> }): string | null {
  const directKeys = ['sessionKey', 'session_id', 'sessionId']
  for (const key of directKeys) {
    const value = event.payload[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  const nestedKeys = ['session', 'chat', 'run']
  for (const key of nestedKeys) {
    const nested = event.payload[key]
    if (!isRecord(nested)) continue

    for (const nestedKey of directKeys) {
      const value = nested[nestedKey]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return null
}

function stringifyPayload(payload: Record<string, unknown>): string {
  const prioritizedKeys = ['text', 'delta', 'content', 'partial', 'message', 'status', 'reason']
  for (const key of prioritizedKeys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return JSON.stringify(payload).slice(0, 240) || 'No payload details'
}

function buildLiveRunItem(eventName: string, payload: Record<string, unknown>, fallbackSessionKey: string): LiveRunItem {
  const lowerEventName = eventName.toLowerCase()
  const toolName = typeof payload.tool === 'string'
    ? payload.tool
    : typeof payload.toolName === 'string'
      ? payload.toolName
      : typeof payload.name === 'string' && lowerEventName.includes('tool')
        ? payload.name
        : ''

  const kind: LiveRunItem['kind'] = lowerEventName.includes('partial') || lowerEventName.includes('delta') || lowerEventName.includes('token')
    ? 'partial'
    : lowerEventName.includes('tool') || Boolean(toolName)
      ? 'tool'
      : lowerEventName.includes('start') || lowerEventName.includes('status') || lowerEventName.includes('done') || lowerEventName.includes('abort') || lowerEventName.includes('error')
        ? 'status'
        : 'event'

  const label = kind === 'tool' && toolName ? toolName : eventName
  const detail = kind === 'tool' && toolName
    ? `${toolName}${typeof payload.status === 'string' ? ` · ${payload.status}` : ''}`
    : stringifyPayload(payload)

  return {
    id: nextLocalMessageId(),
    sessionKey: getEventSessionKey({ payload }) || fallbackSessionKey,
    kind,
    label,
    detail,
    timestamp: createTimestamp(),
    eventName,
  }
}

function buildLocalTemplateBootMessage(template: LocalAgentDraft, skillTemplates: LocalSkillDraft[]): ChatMessage {
  const allowedSkillIds = splitLines(template.form.allowedSkills)
  const linkedSkillLabels = allowedSkillIds.map((skillId) => (
    skillTemplates.find((skill) => skill.preview.id === skillId)?.preview.name || skillId
  ))

  const content = [
    `Session bootstrapped from local template "${template.preview.name}".`,
    template.form.purpose.trim() ? `Purpose: ${template.form.purpose.trim()}` : '',
    linkedSkillLabels.length > 0 ? `Linked local skills: ${linkedSkillLabels.join(', ')}` : 'Linked local skills: none declared yet.',
    `Workspace target: ${template.preview.workspace}`,
  ].filter(Boolean).join('\n\n')

  return {
    id: nextLocalMessageId(),
    role: 'system',
    content,
    timestamp: createTimestamp(),
  }
}

const initialChatPreviewState = loadChatPreviewState()

export default function Chat() {
  const [activeConvKey, setActiveConvKey] = useState(() => initialChatPreviewState.activeConvKey)
  const [inputValue, setInputValue] = useState('')
  const [injectValue, setInjectValue] = useState('')
  const [showThinking, setShowThinking] = useState<string | null>(null)
  const [showInjectComposer, setShowInjectComposer] = useState(false)
  const [showOverrideEditor, setShowOverrideEditor] = useState(false)
  const [uiMessage, setUiMessage] = useState<string | null>(null)
  const [offlineSessions, setOfflineSessions] = useState<ChatSession[]>(() => initialChatPreviewState.offlineSessions)
  const [offlineMessagesBySession, setOfflineMessagesBySession] = useState<Record<string, ChatMessage[]>>(() => initialChatPreviewState.offlineMessagesBySession)
  const [localAgentTemplates, setLocalAgentTemplates] = useState<LocalAgentDraft[]>(() => loadAgentDrafts())
  const [localSkillTemplates, setLocalSkillTemplates] = useState<LocalSkillDraft[]>(() => loadSkillDrafts())
  const [sessionOverridesByKey, setSessionOverridesByKey] = useState<Record<string, SessionOverrideDraft>>(() => initialChatPreviewState.sessionOverridesByKey)
  const [liveRunItemsBySession, setLiveRunItemsBySession] = useState<Record<string, LiveRunItem[]>>(() => initialChatPreviewState.liveRunItemsBySession)
  const [isSending, setIsSending] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingResponseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectionStatus = useConnectionStatus()
  const { execute: rpcAction } = useGatewayAction()

  // Fetch sessions from gateway or use mock
  const { data: liveSessionsRaw, isLive: sessionsLive } = useGatewayData<unknown>(
    'sessions.list', {}, mockSessions, 10000
  )
  const sessions = sessionsLive ? normalizeSessions(liveSessionsRaw, mockSessions) : offlineSessions
  const currentSessionKey = sessions.some(session => session.key === activeConvKey)
    ? activeConvKey
    : sessions[0]?.key || activeConvKey
  const activeSession = sessions.find(s => s.key === currentSessionKey) || sessions[0]

  // Fetch chat history when session changes
  const { data: messagesRaw, isLive: messagesLive, refetch: refetchHistory } = useGatewayData<unknown>(
    'chat.history', { sessionKey: currentSessionKey }, offlineMessagesBySession[currentSessionKey] || []
  )
  const displayedMessages = messagesLive
    ? normalizeMessages(messagesRaw, offlineMessagesBySession[currentSessionKey] || [])
    : (offlineMessagesBySession[currentSessionKey] || [])
  const lastMessageId = displayedMessages[displayedMessages.length - 1]?.id
  const recentToolCalls = displayedMessages.flatMap(message => message.toolCalls || []).slice(-5)
  const sessionUsagePercent = activeSession
    ? Math.min(100, Math.round((activeSession.contextTokens / Math.max(activeSession.totalTokens, 1)) * 100))
    : 0
  const activeLocalTemplate = localAgentTemplates.find((template) => template.preview.id === activeSession?.agentId) || null
  const activeLocalSkillLabels = activeLocalTemplate
    ? splitLines(activeLocalTemplate.form.allowedSkills).map((skillId) => (
        localSkillTemplates.find((skill) => skill.preview.id === skillId)?.preview.name || skillId
      ))
    : []
  function appendLiveRunItem(sessionKey: string, item: LiveRunItem) {
    setLiveRunItemsBySession((prev) => ({
      ...prev,
      [sessionKey]: [...(prev[sessionKey] || []), item].slice(-24),
    }))
  }
  const baselineOverrideDraft = createSessionOverrideDraft(activeSession)
  const activeOverrideDraft = sessionOverridesByKey[currentSessionKey] || baselineOverrideDraft
  const overrideChangeCount = countOverrideChanges(baselineOverrideDraft, activeOverrideDraft)
  const currentLiveRunItems = liveRunItemsBySession[currentSessionKey] || []
  const currentLiveStatus = [...currentLiveRunItems]
    .reverse()
    .find((item) => item.kind === 'status' || item.kind === 'event') || null
  const currentLivePartial = [...currentLiveRunItems]
    .reverse()
    .find((item) => item.kind === 'partial') || null
  const currentLiveToolItems = currentLiveRunItems.filter((item) => item.kind === 'tool').slice(-4)
  const pendingLiveChatTodos = [
    'Verify exact live session override payloads against a real gateway',
    'Wire exact chat.inject payloads against a real gateway',
    'Map gateway-specific partial and tool event names after live verification',
    'Clear server-side session history safely',
    'Support file attachments and upload-backed tool flows',
  ]

  // Listen for real-time chat events
  useOpenClawEvent('chat', () => {
    if (connectionStatus !== 'connected') return
    setIsSending(false)
    void refetchHistory()
  })

  useOpenClawEvent('*', (event) => {
    if (connectionStatus !== 'connected') return

    const lowerEventName = event.event.toLowerCase()
    if (!lowerEventName.includes('chat') && !lowerEventName.includes('tool') && !lowerEventName.includes('agent')) {
      return
    }

    const sessionKey = getEventSessionKey(event) || currentSessionKey
    if (!sessionKey) return

    const item = buildLiveRunItem(event.event, event.payload, sessionKey)
    appendLiveRunItem(sessionKey, item)

    if (item.kind === 'partial') {
      setIsSending(true)
      return
    }

    if (
      lowerEventName.includes('done') ||
      lowerEventName.includes('finish') ||
      lowerEventName.includes('complete') ||
      lowerEventName.includes('abort') ||
      lowerEventName.includes('stop') ||
      lowerEventName.includes('error')
    ) {
      setIsSending(false)
    }
  })

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastMessageId, currentLivePartial?.id, currentLiveStatus?.id])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px'
    }
  }, [inputValue])

  useEffect(() => {
    return () => {
      if (pendingResponseTimerRef.current) {
        clearTimeout(pendingResponseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    persistChatPreviewState({
      activeConvKey,
      offlineSessions,
      offlineMessagesBySession,
      sessionOverridesByKey,
      liveRunItemsBySession,
    })
  }, [
    activeConvKey,
    liveRunItemsBySession,
    offlineMessagesBySession,
    offlineSessions,
    sessionOverridesByKey,
  ])

  useEffect(() => subscribeAgentDrafts(() => {
    setLocalAgentTemplates(loadAgentDrafts())
  }), [])

  useEffect(() => subscribeSkillDrafts(() => {
    setLocalSkillTemplates(loadSkillDrafts())
  }), [])

  const appendOfflineMessage = (sessionKey: string, message: ChatMessage, previewOverride?: string) => {
    const preview = previewOverride || toPreview(message.content)

    setOfflineMessagesBySession(prev => ({
      ...prev,
      [sessionKey]: [...(prev[sessionKey] || []), message],
    }))

    setOfflineSessions(prev => prev.map(session => (
      session.key === sessionKey
        ? {
            ...session,
            title: session.title === 'New Chat' && message.role === 'user' ? toPreview(message.content) : session.title,
            lastMessage: preview,
            timestamp: message.timestamp,
            unread: false,
          }
        : session
    )))
  }

  const copyToClipboard = (value: string, successMessage: string) => {
    void copyTextToClipboard(value).then((didCopy) => {
      setUiMessage(didCopy ? successMessage : 'Clipboard access is unavailable in this browser context.')
    })
  }

  // Send message
  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text) return

    // Optimistic update
    const userMsg: ChatMessage = {
      id: nextLocalMessageId(),
      role: 'user',
      content: text,
      timestamp: createTimestamp(),
    }
    if (!messagesLive) {
      appendOfflineMessage(currentSessionKey, userMsg)
    }

    setInputValue('')
    setIsSending(true)

    if (connectionStatus === 'connected') {
      appendLiveRunItem(currentSessionKey, {
        id: nextLocalMessageId(),
        sessionKey: currentSessionKey,
        kind: 'status',
        label: 'chat.send',
        detail: 'Message sent. Waiting for gateway events or refreshed history.',
        timestamp: createTimestamp(),
        eventName: 'chat.send',
      })

      try {
        await openclawClient.sendChat(text, currentSessionKey)
        // Response will arrive via chat event → refetchHistory
        return
      } catch {
        appendLiveRunItem(currentSessionKey, {
          id: nextLocalMessageId(),
          sessionKey: currentSessionKey,
          kind: 'status',
          label: 'local fallback',
          detail: 'Live send failed, so the UI fell back to an offline simulated response.',
          timestamp: createTimestamp(),
          eventName: 'chat.send.error',
        })
        simulateResponse(text, currentSessionKey, activeSession?.agent || 'Agent')
        return
      }
    }

    simulateResponse(text, currentSessionKey, activeSession?.agent || 'Agent')
  }

  const simulateResponse = (userText: string, sessionKey: string, agentName: string) => {
    pendingResponseTimerRef.current = setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: nextLocalMessageId(),
        role: 'assistant',
        content: `I received your message: "${userText}"\n\n*This is a simulated response. Connect to an OpenClaw gateway for real agent interactions.*`,
        timestamp: createTimestamp(),
        agent: agentName,
      }

      appendOfflineMessage(sessionKey, assistantMsg)
      pendingResponseTimerRef.current = null
      setIsSending(false)
    }, 800)
  }

  // Abort current run
  const handleAbort = async () => {
    if (connectionStatus === 'connected') {
      await rpcAction('chat.abort', { sessionKey: currentSessionKey })
      appendLiveRunItem(currentSessionKey, {
        id: nextLocalMessageId(),
        sessionKey: currentSessionKey,
        kind: 'status',
        label: 'chat.abort',
        detail: 'Abort requested from the web UI.',
        timestamp: createTimestamp(),
        eventName: 'chat.abort',
      })
      setIsSending(false)
      return
    }

    if (pendingResponseTimerRef.current) {
      clearTimeout(pendingResponseTimerRef.current)
      pendingResponseTimerRef.current = null
    }
    setIsSending(false)
  }

  // New session
  const handleNewSession = () => {
    if (sessionsLive) {
      setUiMessage('Creating new live sessions is not wired into this UI yet. Use an existing session for now.')
      setShowThinking(null)
      setInputValue('')
      return
    }

    const sessionKey = `local:session:${nextLocalMessageId()}`
    const nextSession: ChatSession = {
      id: sessionKey,
      key: sessionKey,
      title: 'New Chat',
      agent: activeSession?.agent || 'Assistant',
      agentId: activeSession?.agentId || 'local-agent',
      lastMessage: 'No messages yet',
      timestamp: 'Just now',
      unread: false,
      kind: 'main',
      model: activeSession?.model || 'offline/mock',
      contextTokens: 0,
      totalTokens: activeSession?.totalTokens || 200000,
    }

    setOfflineSessions(prev => [nextSession, ...prev])
    setOfflineMessagesBySession(prev => ({ ...prev, [sessionKey]: [] }))
    setSessionOverridesByKey((prev) => ({
      ...prev,
      [sessionKey]: createSessionOverrideDraft(nextSession),
    }))
    setActiveConvKey(sessionKey)
    setShowThinking(null)
    setInputValue('')
    setUiMessage(null)
  }

  // Copy message
  const handleCopy = (content: string) => {
    copyToClipboard(content, 'Message copied to clipboard.')
  }

  const handleClearConversation = () => {
    setShowThinking(null)
    setLiveRunItemsBySession((prev) => ({
      ...prev,
      [currentSessionKey]: [],
    }))

    if (messagesLive || connectionStatus === 'connected') {
      setUiMessage('Clearing server-side history is not supported in this UI yet.')
      return
    }

    setOfflineMessagesBySession(prev => ({ ...prev, [currentSessionKey]: [] }))
    setOfflineSessions(prev => prev.map(session => (
      session.key === currentSessionKey
        ? { ...session, lastMessage: 'Conversation cleared', timestamp: 'Just now', unread: false }
        : session
    )))
    setUiMessage(null)
  }

  const handleOpenAttachments = () => {
    setUiMessage('File attachments are not wired into this UI yet.')
  }

  const handleOpenSessionMenu = () => {
    setUiMessage('Session actions beyond copy, stop, and clear are not exposed here yet.')
  }

  const handleOverrideFieldChange = (field: keyof SessionOverrideDraft, value: string) => {
    setSessionOverridesByKey((prev) => ({
      ...prev,
      [currentSessionKey]: {
        ...(prev[currentSessionKey] || baselineOverrideDraft),
        [field]: value,
      },
    }))
  }

  const handleResetOverrides = () => {
    setSessionOverridesByKey((prev) => ({
      ...prev,
      [currentSessionKey]: createSessionOverrideDraft(activeSession),
    }))
    setUiMessage('Reset the local session override draft back to the current session snapshot.')
  }

  const handleSaveOverrides = () => {
    if (overrideChangeCount === 0) {
      setUiMessage('No local session override changes are pending yet.')
      return
    }

    setUiMessage(
      connectionStatus === 'connected'
        ? 'Saved a local override draft. Applying it to a live session stays gated until we verify the exact gateway contract.'
        : 'Saved a local override draft for this offline session preview in browser storage.',
    )
  }

  const handleClearLiveMonitor = () => {
    setLiveRunItemsBySession((prev) => ({
      ...prev,
      [currentSessionKey]: [],
    }))
    setUiMessage('Cleared the local live run monitor for this session.')
  }

  const handleStartFromLocalTemplate = (template: LocalAgentDraft) => {
    if (sessionsLive || connectionStatus === 'connected') {
      setUiMessage('Starting live sessions from local templates stays on the TODO list until a real OpenClaw gateway is available.')
      return
    }

    const sessionKey = `local:template:${template.preview.id}:${nextLocalMessageId()}`
    const bootMessage = buildLocalTemplateBootMessage(template, localSkillTemplates)
    const nextSession: ChatSession = {
      id: sessionKey,
      key: sessionKey,
      title: `${template.preview.name} Session`,
      agent: template.preview.name,
      agentId: template.preview.id,
      lastMessage: toPreview(bootMessage.content),
      timestamp: 'Just now',
      unread: false,
      kind: 'main',
      model: template.preview.model,
      contextTokens: 0,
      totalTokens: 200000,
    }

    setOfflineSessions((prev) => [nextSession, ...prev])
    setOfflineMessagesBySession((prev) => ({ ...prev, [sessionKey]: [bootMessage] }))
    setSessionOverridesByKey((prev) => ({
      ...prev,
      [sessionKey]: {
        model: template.preview.model,
        maxTokens: '200000',
        toolMode: 'inherit',
        notes: template.form.purpose.trim(),
      },
    }))
    setActiveConvKey(sessionKey)
    setInputValue('')
    setInjectValue('')
    setShowInjectComposer(false)
    setShowThinking(null)
    setUiMessage(`Started an offline session from local template "${template.preview.name}".`)
  }

  const handleInjectMessage = () => {
    const text = injectValue.trim()
    if (!text) return

    if (messagesLive || connectionStatus === 'connected') {
      setUiMessage('Live chat.inject remains on the TODO list until a real OpenClaw gateway is installed and verified.')
      return
    }

    appendOfflineMessage(
      currentSessionKey,
      {
        id: nextLocalMessageId(),
        role: 'system',
        content: text,
        timestamp: createTimestamp(),
      },
      'System note updated',
    )
    setInjectValue('')
    setShowInjectComposer(false)
    setUiMessage('Injected a local system note into the offline session preview.')
  }

  const filteredSessions = sessions.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.agent.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const filteredLocalTemplates = localAgentTemplates.filter((template) =>
    template.preview.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.preview.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex gap-3 md:gap-4 h-[calc(100vh-8rem)] md:h-[calc(100vh-8rem)] animate-fade-in">
      {/* Left: Conversation History */}
      <div className="hidden md:flex w-64 lg:w-72 flex-shrink-0 flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-xl glass text-xs">
            <Search size={14} className="text-text-tertiary" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-text-primary placeholder-text-tertiary w-full"
            />
          </div>
          <button
            onClick={handleNewSession}
            className="w-8 h-8 rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-light transition-colors"
          >
            <Plus size={15} />
          </button>
        </div>

        {!sessionsLive && (
          <div className="text-[9px] text-warning px-2">Mock data — connect gateway for live sessions</div>
        )}

        {!sessionsLive && (
          <GlassCard title="Start From Local Template" padding="sm">
            {localAgentTemplates.length === 0 ? (
              <div className="text-[10px] text-text-tertiary leading-relaxed">
                Create a local agent template in the Agents page, then you can launch an offline session from it here.
              </div>
            ) : filteredLocalTemplates.length === 0 ? (
              <div className="text-[10px] text-text-tertiary leading-relaxed">
                No local templates match the current chat search.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLocalTemplates.slice(0, 4).map((template) => {
                  const linkedSkills = splitLines(template.form.allowedSkills)

                  return (
                    <button
                      key={template.preview.id}
                      onClick={() => handleStartFromLocalTemplate(template)}
                      className="w-full text-left rounded-xl bg-[var(--color-glass-subtle)] hover:bg-[var(--color-glass)] transition-colors px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-text-primary truncate">{template.preview.name}</div>
                          <div className="text-[10px] text-text-tertiary truncate">{template.preview.id}</div>
                        </div>
                        <span className="text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent">
                          Launch
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-text-tertiary">
                        <span>{linkedSkills.length} linked skill{linkedSkills.length === 1 ? '' : 's'}</span>
                        <span>{template.updatedAt}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </GlassCard>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {filteredSessions.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setActiveConvKey(conv.key)}
              className={`p-3 rounded-xl cursor-pointer transition-all ${
                currentSessionKey === conv.key ? 'glass-strong shadow-sm' : 'hover:bg-[var(--color-glass-hover)]'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center flex-shrink-0">
                  <Bot size={13} className="text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-text-primary truncate">{conv.title}</div>
                  <div className="text-[10px] text-text-tertiary">{conv.agent}</div>
                </div>
                {conv.unread && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />}
              </div>
              <p className="text-[11px] text-text-tertiary truncate pl-9">{conv.lastMessage}</p>
              <p className="text-[10px] text-text-tertiary/60 pl-9 mt-0.5">{conv.timestamp}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Center: Chat Area */}
      <div className="flex-1 flex flex-col glass rounded-2xl overflow-hidden">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-[var(--color-glass-border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center">
              <Bot size={16} className="text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{activeSession?.title || 'New Chat'}</h3>
              <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
                <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-success' : 'bg-text-tertiary'}`} />
                {activeSession?.agent} &middot; {activeSession?.model}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isSending && (
              <button onClick={handleAbort} className="w-8 h-8 rounded-lg bg-danger/10 hover:bg-danger/20 flex items-center justify-center text-danger transition-colors" title="Stop">
                <Square size={14} />
              </button>
            )}
            <button onClick={handleClearConversation} className="w-8 h-8 rounded-lg hover:bg-[var(--color-glass-hover)] flex items-center justify-center text-text-secondary transition-colors" title="Clear">
              <Trash2 size={15} />
            </button>
            <button onClick={handleOpenSessionMenu} className="w-8 h-8 rounded-lg hover:bg-[var(--color-glass-hover)] flex items-center justify-center text-text-secondary transition-colors" title="Session actions">
              <MoreHorizontal size={15} />
            </button>
          </div>
        </div>

        {uiMessage && (
          <div className="mx-4 md:mx-5 mt-3 rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
            {uiMessage}
          </div>
        )}

        <div className="mx-4 md:mx-5 mt-3 space-y-3">
          {!sessionsLive && (
            <div className="md:hidden glass-subtle rounded-2xl p-3 space-y-2">
              <div className="text-xs font-medium text-text-primary">Start From Local Template</div>
              <div className="text-[10px] text-text-tertiary">
                Use your saved local agent templates to bootstrap offline sessions directly from Chat.
              </div>
              {localAgentTemplates.length === 0 ? (
                <div className="text-[10px] text-text-tertiary">
                  No local agent templates yet. Create one in Agents first.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLocalTemplates.slice(0, 3).map((template) => (
                    <button
                      key={`mobile-${template.preview.id}`}
                      onClick={() => handleStartFromLocalTemplate(template)}
                      className="w-full text-left rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2 hover:bg-[var(--color-glass)] transition-colors"
                    >
                      <div className="text-[11px] font-medium text-text-primary">{template.preview.name}</div>
                      <div className="text-[10px] text-text-tertiary mt-1">{template.preview.id}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {pendingLiveChatTodos.map((item) => (
              <div key={item} className="rounded-xl px-3 py-2 text-xs bg-warning/10 text-warning">
                TODO: {item}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="glass-subtle rounded-2xl p-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-text-primary">Session Tools</div>
                  <div className="text-[10px] text-text-tertiary mt-1">
                    Local controls for the current session. Live write actions stay gated until a real gateway is available.
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => copyToClipboard(activeSession?.key || '', 'Session key copied to clipboard.')}
                    disabled={!activeSession?.key}
                    className="px-3 py-1.5 rounded-xl bg-[var(--color-glass-subtle)] text-text-secondary text-[11px] font-medium hover:text-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Copy Session Key
                  </button>
                  <button
                    onClick={() => setShowInjectComposer((prev) => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
                  >
                    {showInjectComposer ? 'Hide Inject Note' : 'Inject Note'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-glass-subtle)] text-text-secondary">kind: {activeSession?.kind || 'main'}</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-glass-subtle)] text-text-secondary">agent: {activeSession?.agentId || 'unknown'}</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-glass-subtle)] text-text-secondary">usage: {sessionUsagePercent}%</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-glass-subtle)] text-text-secondary">{messagesLive ? 'live history' : 'offline preview'}</span>
                {activeLocalTemplate && (
                  <span className="text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent">local template session</span>
                )}
              </div>

              {showInjectComposer && (
                <div className="mt-3 rounded-xl bg-[var(--color-glass-subtle)] p-3 space-y-2 animate-fade-in">
                  <div className="text-[11px] font-medium text-text-primary">Inject Session Note</div>
                  <textarea
                    value={injectValue}
                    onChange={(event) => setInjectValue(event.target.value)}
                    placeholder={connectionStatus === 'connected'
                      ? 'Live inject is pending real gateway verification. You can compose the note here.'
                      : 'Add a system note to this offline session preview...'}
                    className="w-full min-h-[88px] rounded-xl bg-transparent outline-none text-sm text-text-primary placeholder-text-tertiary resize-y"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] text-text-tertiary">
                      {connectionStatus === 'connected'
                        ? 'This button stays local/TODO until we verify the exact chat.inject contract.'
                        : 'Offline mode will append a local system message to the current session.'}
                    </div>
                    <button
                      onClick={handleInjectMessage}
                      disabled={!injectValue.trim()}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                        injectValue.trim()
                          ? 'bg-accent text-white hover:bg-accent-light'
                          : 'bg-accent/30 text-white/60 cursor-not-allowed'
                      }`}
                    >
                      Inject
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="glass-subtle rounded-2xl p-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-text-primary">Session Overrides</div>
                  <div className="text-[10px] text-text-tertiary mt-1">
                    Prepare local override drafts for the current session before live apply is verified.
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {overrideChangeCount > 0 && (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-info/10 text-info">
                      {overrideChangeCount} pending change{overrideChangeCount === 1 ? '' : 's'}
                    </span>
                  )}
                  <button
                    onClick={() => setShowOverrideEditor((prev) => !prev)}
                    className="px-3 py-1.5 rounded-xl bg-[var(--color-glass-subtle)] text-text-secondary text-[11px] font-medium hover:text-accent transition-colors"
                  >
                    {showOverrideEditor ? 'Hide Overrides' : 'Edit Overrides'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Model</div>
                  <div className="text-[11px] text-text-primary mt-1 truncate">{activeOverrideDraft.model || 'inherit session model'}</div>
                </div>
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Max Tokens</div>
                  <div className="text-[11px] text-text-primary mt-1">{activeOverrideDraft.maxTokens || 'inherit runtime default'}</div>
                </div>
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Tool Mode</div>
                  <div className="text-[11px] text-text-primary mt-1">{activeOverrideDraft.toolMode || 'inherit'}</div>
                </div>
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Notes</div>
                  <div className="text-[11px] text-text-primary mt-1 truncate">{activeOverrideDraft.notes || 'No local notes yet'}</div>
                </div>
              </div>

              {showOverrideEditor && (
                <div className="mt-3 rounded-xl bg-[var(--color-glass-subtle)] p-3 space-y-3 animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-medium text-text-primary block mb-1.5">Model Override</span>
                      <input
                        type="text"
                        value={activeOverrideDraft.model}
                        onChange={(event) => handleOverrideFieldChange('model', event.target.value)}
                        placeholder="anthropic/claude-sonnet-4-6"
                        className="w-full glass rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-medium text-text-primary block mb-1.5">Max Tokens</span>
                      <input
                        type="number"
                        min="1"
                        value={activeOverrideDraft.maxTokens}
                        onChange={(event) => handleOverrideFieldChange('maxTokens', event.target.value)}
                        placeholder="4096"
                        className="w-full glass rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-medium text-text-primary block mb-1.5">Tool Mode</span>
                      <select
                        value={activeOverrideDraft.toolMode}
                        onChange={(event) => handleOverrideFieldChange('toolMode', event.target.value)}
                        className="w-full glass rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent"
                      >
                        <option value="inherit">inherit</option>
                        <option value="allow">allow</option>
                        <option value="readonly">readonly</option>
                        <option value="deny">deny</option>
                      </select>
                    </label>
                    <label className="block md:col-span-2">
                      <span className="text-[11px] font-medium text-text-primary block mb-1.5">Run Notes</span>
                      <textarea
                        value={activeOverrideDraft.notes}
                        onChange={(event) => handleOverrideFieldChange('notes', event.target.value)}
                        rows={3}
                        placeholder="Capture local instructions or runtime caveats for this session."
                        className="w-full glass rounded-xl px-3 py-2 text-sm text-text-primary outline-none resize-y"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] text-text-tertiary">
                      {connectionStatus === 'connected'
                        ? 'Saving stays local for now. Applying these overrides to a live session is still gated until gateway verification.'
                        : 'Offline mode stores this override draft in browser storage for this UI.'}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetOverrides}
                        className="px-3 py-1.5 rounded-xl bg-[var(--color-glass-subtle)] text-text-secondary text-[11px] font-medium hover:text-accent transition-colors"
                      >
                        Reset
                      </button>
                      <button
                        onClick={handleSaveOverrides}
                        className="px-3 py-1.5 rounded-xl bg-accent text-white text-[11px] font-medium hover:bg-accent-light transition-colors"
                      >
                        Save Draft
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {(connectionStatus === 'connected' || isSending || currentLiveRunItems.length > 0) && (
            <div className="glass-subtle rounded-2xl p-3 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-text-primary">Live Run Monitor</div>
                  <div className="text-[10px] text-text-tertiary mt-1">
                    Gateway events are captured here as a local monitor layer. Exact event naming still needs live verification.
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] px-2 py-1 rounded-full ${isSending ? 'bg-warning/10 text-warning' : 'bg-[var(--color-glass-subtle)] text-text-secondary'}`}>
                    {isSending ? 'run active' : 'idle'}
                  </span>
                  <button
                    onClick={handleClearLiveMonitor}
                    disabled={currentLiveRunItems.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-[var(--color-glass-subtle)] text-text-secondary text-[11px] font-medium hover:text-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Clear Monitor
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Latest Status</div>
                  <div className="text-[11px] text-text-primary mt-1">{currentLiveStatus?.label || 'No status events yet'}</div>
                  {currentLiveStatus && (
                    <div className="text-[10px] text-text-tertiary mt-1 whitespace-pre-wrap break-words">{currentLiveStatus.detail}</div>
                  )}
                </div>
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Latest Partial</div>
                  <div className="text-[11px] text-text-primary mt-1 whitespace-pre-wrap break-words">
                    {currentLivePartial?.detail || 'Waiting for partial output...'}
                  </div>
                </div>
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Tool Events</div>
                  {currentLiveToolItems.length > 0 ? (
                    <div className="space-y-1.5 mt-1">
                      {currentLiveToolItems.map((item) => (
                        <div key={item.id} className="text-[10px] text-text-secondary">
                          <span className="font-medium text-text-primary">{item.label}</span>
                          <span className="text-text-tertiary"> · {item.detail}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-text-primary mt-1">No tool events yet</div>
                  )}
                </div>
              </div>

              {currentLiveRunItems.length > 0 && (
                <div className="space-y-2">
                  {currentLiveRunItems.slice(-6).reverse().map((item) => (
                    <div key={item.id} className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-text-primary">{item.label}</div>
                        <div className="text-[10px] text-text-tertiary">{item.timestamp}</div>
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-1">{item.eventName}</div>
                      <div className="text-[11px] text-text-secondary mt-1 whitespace-pre-wrap break-words">{item.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 space-y-4">
          {displayedMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                <Sparkles size={28} className="text-accent" />
              </div>
              <h4 className="text-sm font-semibold text-text-primary mb-1">Start a conversation</h4>
              <p className="text-xs text-text-tertiary max-w-xs">
                Send a message to begin interacting with the agent, or launch an offline session from one of your local templates.
              </p>
            </div>
          )}

          {displayedMessages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-light)]'
                  : msg.role === 'system'
                    ? 'bg-gradient-to-br from-slate-400/20 to-slate-500/20'
                    : 'bg-gradient-to-br from-accent/15 to-accent-light/15'
              }`}>
                {msg.role === 'user'
                  ? <User size={14} className="text-white" />
                  : msg.role === 'system'
                    ? <Bot size={14} className="text-text-secondary" />
                    : <Sparkles size={14} className="text-accent" />}
              </div>

              <div className={`max-w-[75%] md:max-w-[70%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-accent text-white rounded-tr-sm'
                    : msg.role === 'system'
                      ? 'bg-slate-500/10 border border-slate-400/15 rounded-tl-sm text-text-primary'
                      : 'glass-strong rounded-tl-sm text-text-primary'
                }`}>
                  {msg.role === 'system' && (
                    <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">System Note</div>
                  )}
                  <div className="whitespace-pre-wrap text-xs">{msg.content}</div>
                </div>

                <div className="flex items-center gap-2 mt-1.5 px-1">
                  <span className="text-[10px] text-text-tertiary">{msg.timestamp}</span>
                  {msg.agent && <span className="text-[10px] text-accent/60">{msg.agent}</span>}
                  {(msg.role === 'assistant' || msg.role === 'system') && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleCopy(msg.content)} className="p-0.5 hover:bg-[var(--color-glass-hover)] rounded transition-colors" title="Copy">
                        <Copy size={10} className="text-text-tertiary" />
                      </button>
                      {msg.thinking && (
                        <button onClick={() => setShowThinking(showThinking === msg.id ? null : msg.id)} className="p-0.5 hover:bg-[var(--color-glass-hover)] rounded transition-colors" title="Show thinking">
                          <Eye size={10} className={showThinking === msg.id ? 'text-accent' : 'text-text-tertiary'} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {msg.toolCalls.map((call, index) => (
                      <div key={`${msg.id}-${call.tool}-${index}`} className="glass-subtle rounded-xl px-3 py-2 text-[10px] text-text-secondary">
                        <div className="flex items-center gap-2">
                          <ArrowRight size={10} className="text-accent flex-shrink-0" />
                          <span className="font-mono text-text-primary">{call.tool}</span>
                          {call.time && <span className="text-text-tertiary">{call.time}</span>}
                        </div>
                        <div className="mt-1 font-mono text-text-tertiary whitespace-pre-wrap break-all">{call.args}</div>
                      </div>
                    ))}
                  </div>
                )}

                {showThinking === msg.id && msg.thinking && (
                  <div className="mt-2 glass-subtle rounded-xl p-3 text-[11px] text-text-secondary font-mono animate-fade-in">
                    <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-accent font-sans font-medium">
                      <Sparkles size={10} />
                      Thinking Chain
                    </div>
                    {msg.thinking}
                  </div>
                )}
              </div>
            </div>
          ))}

          {(connectionStatus === 'connected' && (isSending || currentLivePartial || currentLiveStatus || currentLiveToolItems.length > 0)) && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-accent/15 to-accent-light/15">
                <Sparkles size={14} className="text-accent" />
              </div>
              <div className="max-w-[75%] md:max-w-[70%]">
                <div className="glass-strong rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-accent/70 mb-1">
                    {currentLivePartial ? 'Live Partial Output' : 'Live Run Status'}
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-text-primary">
                    {currentLivePartial?.detail || currentLiveStatus?.detail || 'Waiting for the gateway to stream the next event...'}
                  </div>
                  {currentLiveToolItems.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {currentLiveToolItems.slice(-2).map((item) => (
                        <div key={`bubble-${item.id}`} className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2 text-[10px] text-text-secondary">
                          <div className="font-medium text-text-primary">{item.label}</div>
                          <div className="mt-1 whitespace-pre-wrap break-words">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 px-1">
                  <span className="text-[10px] text-text-tertiary">
                    {currentLivePartial?.timestamp || currentLiveStatus?.timestamp || 'Waiting'}
                  </span>
                  <span className="text-[10px] text-accent/60">
                    {isSending ? 'monitoring live events' : 'latest gateway event'}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-4 md:px-5 py-3 border-t border-[var(--color-glass-border)]">
          <div className="flex items-end gap-2">
            <button onClick={handleOpenAttachments} className="w-9 h-9 rounded-xl glass-subtle flex items-center justify-center text-text-secondary hover:text-accent transition-colors flex-shrink-0" title="Attach file">
              <Paperclip size={16} />
            </button>
            <div className="flex-1 glass-subtle rounded-2xl px-4 py-2.5 flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={connectionStatus === 'connected' ? 'Type a message...' : 'Type a message (offline mode)...'}
                className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder-text-tertiary resize-none max-h-32"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 shadow-sm ${
                inputValue.trim()
                  ? 'bg-accent text-white hover:bg-accent-light'
                  : 'bg-accent/30 text-white/60 cursor-not-allowed'
              }`}
            >
              <Send size={16} />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-2 px-12">
            <span className="text-[10px] text-text-tertiary">Enter to send</span>
            <span className="text-[10px] text-text-tertiary">Shift+Enter for new line</span>
            {!messagesLive && <span className="text-[10px] text-warning">Offline mode</span>}
          </div>
        </div>
      </div>

      {/* Right: Context Inspector */}
      <div className="hidden lg:block w-64 flex-shrink-0 space-y-3">
        {activeLocalTemplate && (
          <GlassCard title="Local Template" padding="sm">
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Template</div>
                <div className="glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary">
                  {activeLocalTemplate.preview.name}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Updated</div>
                <div className="glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary">
                  {activeLocalTemplate.updatedAt}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Linked Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {activeLocalSkillLabels.length > 0 ? activeLocalSkillLabels.map((label) => (
                    <span key={label} className="text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent">
                      {label}
                    </span>
                  )) : (
                    <span className="text-[10px] text-text-tertiary">No linked local skills</span>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        <GlassCard title="Context Inspector" padding="sm">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Session</div>
              <div className="glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-text-secondary truncate">
                {activeSession?.key || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Agent ID</div>
              <div className="glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary">
                {activeSession?.agentId || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Kind</div>
              <div className="glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary">
                {activeSession?.kind || 'main'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Model</div>
              <div className="glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary">
                {activeSession?.model || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Tokens Used</div>
              <div className="glass-subtle rounded-lg px-2.5 py-1.5 text-[11px] text-text-secondary">
                {activeSession ? `${activeSession.contextTokens.toLocaleString()} / ${activeSession.totalTokens.toLocaleString()}` : 'N/A'}
              </div>
              {activeSession && (
                <div className="mt-1 h-1 w-full bg-[var(--color-glass-border)] rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${(activeSession.contextTokens / activeSession.totalTokens) * 100}%` }} />
                </div>
              )}
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Tool Calls" padding="sm">
          <div className="space-y-2">
            {recentToolCalls.map((call, i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg glass-subtle text-[10px]">
                <ArrowRight size={10} className="text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-mono text-text-primary font-medium">{call.tool}</span>
                  <span className="text-text-tertiary ml-1 truncate block">{call.args}</span>
                </div>
                <span className="text-text-tertiary flex-shrink-0">{call.time}</span>
              </div>
            ))}
            {recentToolCalls.length === 0 && (
              <p className="text-[10px] text-text-tertiary text-center py-2">No tool calls yet</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
