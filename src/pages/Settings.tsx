import { useMemo, useState } from 'react'
import {
  Settings2,
  Key,
  Shield,
  Network,
  Info,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  Globe,
  Server,
  Wifi,
  Copy,
  RotateCcw,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { useGatewayData, useConnectionStatus } from '../hooks/useOpenClaw'
import { copyTextToClipboard } from '../lib/clipboard'
import { normalizeChannels, normalizeNodes, normalizePresence } from '../lib/openclaw-adapters'
import { mockChannels, mockNodes, mockSystemStatus } from '../lib/mock-data'
import { openclawClient, type GatewayErrorDetails } from '../lib/openclaw-client'
import {
  analyzeConfigDraft,
  buildDraftFields,
  buildInitialDraftValues,
  formatConfigValue,
  type DraftFieldValue,
  unwrapPayload,
} from '../lib/settings-draft'

type SettingsTab = 'general' | 'connection' | 'security' | 'about'

type UnknownRecord = Record<string, unknown>

const mockConfigPreview = {
  gateway: {
    port: 18789,
    bind: '127.0.0.1',
    authMode: 'token',
    allowedOrigins: ['http://localhost:5173'],
  },
  agents: {
    defaultModel: 'anthropic/claude-opus-4-6',
    workspace: '~/.openclaw/workspace',
  },
  channels: {
    whatsapp: { enabled: true },
    telegram: { enabled: true },
  },
}

const mockConfigSchemaPreview = {
  title: 'OpenClaw Config',
  type: 'object',
  properties: {
    gateway: {
      type: 'object',
      properties: {
        port: { type: 'number' },
        bind: { type: 'string' },
        authMode: { type: 'string', enum: ['none', 'token', 'password', 'trusted-proxy'] },
        allowedOrigins: { type: 'array', items: { type: 'string' } },
      },
    },
    agents: {
      type: 'object',
      properties: {
        defaultModel: { type: 'string' },
        workspace: { type: 'string' },
      },
    },
  },
}

const tabs: { id: SettingsTab; label: string; icon: typeof Settings2 }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'connection', label: 'Connection', icon: Network },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
]

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractGatewayPort(url: string, fallbackPort: number): string {
  try {
    const parsed = new URL(url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:'))
    return parsed.port || `${fallbackPort}`
  } catch {
    return `${fallbackPort}`
  }
}

function updateGatewayUrlPort(url: string, port: string, fallbackPort: number): string {
  try {
    const parsed = new URL(url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:'))
    parsed.port = port.trim() || `${fallbackPort}`
    return parsed.toString().replace(/^http:/, 'ws:').replace(/^https:/, 'wss:').replace(/\/$/, '')
  } catch {
    const protocol = url.startsWith('wss://') ? 'wss' : 'ws'
    return `${protocol}://127.0.0.1:${port.trim() || fallbackPort}`
  }
}

function buildGatewayGuidance(error: GatewayErrorDetails | null, isLoopbackGateway: boolean): Array<{
  type: 'info' | 'warning' | 'error'
  text: string
}> {
  if (!error) return []

  const code = error.code?.toUpperCase() || ''
  const detailText = [
    error.message,
    typeof error.details?.reason === 'string' ? error.details.reason : '',
    typeof error.details?.hint === 'string' ? error.details.hint : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const notices: Array<{ type: 'info' | 'warning' | 'error'; text: string }> = []

  if (error.details?.canRetryWithDeviceToken === true) {
    notices.push({
      type: 'info',
      text: 'Gateway allows one trusted retry with the cached paired-device token. This client will attempt that automatically once.',
    })
  }

  if (code.includes('PAIR') || detailText.includes('pair')) {
    notices.push({
      type: 'warning',
      text: 'This browser likely needs device pairing approval. Approve the browser device from a trusted OpenClaw session or local machine, then reconnect.',
    })
  }

  if (code.includes('AUTH_TOKEN_MISMATCH')) {
    notices.push({
      type: 'warning',
      text: 'The shared gateway token no longer matches this paired browser. Refresh the share link or reconnect with a fresh token if the automatic device-token retry does not recover.',
    })
  }

  if (code.includes('ORIGIN') || detailText.includes('origin')) {
    notices.push({
      type: 'warning',
      text: 'This site origin does not appear to be allowed by the gateway. Add this UI origin to gateway.allowedOrigins and reconnect over HTTPS/WSS.',
    })
  }

  if (code.includes('SECURE') || detailText.includes('secure context') || detailText.includes('https')) {
    notices.push({
      type: 'warning',
      text: isLoopbackGateway
        ? 'Browser device identity failed in the current context. Try a modern browser tab on localhost or open the UI from a secure context.'
        : 'Remote device authentication requires a secure browser context. Open this UI over HTTPS and use a wss:// gateway URL.',
    })
  }

  if (
    notices.length === 0 &&
    (code.includes('AUTH') || code.includes('UNAUTHORIZED') || detailText.includes('token') || detailText.includes('password'))
  ) {
    notices.push({
      type: 'warning',
      text: 'Authentication was rejected by the gateway. Verify the shared token or password, then reconnect.',
    })
  }

  return notices
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [configPreviewMode, setConfigPreviewMode] = useState<'config' | 'schema'>('config')
  const [showApiKey, setShowApiKey] = useState(false)
  const [configDraft, setConfigDraft] = useState<Record<string, DraftFieldValue>>({})
  const [configDraftDirty, setConfigDraftDirty] = useState(false)
  const [gatewayUrl, setGatewayUrl] = useState(() => openclawClient.getSavedGatewayUrl())
  const [gatewayToken, setGatewayToken] = useState(() => openclawClient.getSessionGatewayToken(openclawClient.getSavedGatewayUrl()))
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [settingsMessage, setSettingsMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const connectionStatus = useConnectionStatus()
  const { data: presenceRaw, isLive: presenceLive } = useGatewayData<unknown>('system-presence', {}, mockSystemStatus, 10000)
  const { data: nodesRaw, isLive: nodesLive } = useGatewayData<unknown>('node.list', {}, mockNodes, 15000)
  const { data: channelsRaw, isLive: channelsLive } = useGatewayData<unknown>('channels.status', {}, mockChannels, 15000)
  const { data: configRaw, isLive: configLive } = useGatewayData<unknown>('config.get', {}, mockConfigPreview)
  const { data: configSchemaRaw, isLive: configSchemaLive } = useGatewayData<unknown>('config.schema', {}, mockConfigSchemaPreview)
  const presence = normalizePresence(presenceRaw, [], [], mockSystemStatus)
  const nodes = normalizeNodes(nodesRaw, mockNodes)
  const channels = normalizeChannels(channelsRaw, mockChannels)
  const isLive = presenceLive || nodesLive || channelsLive
  const previewPayload = configPreviewMode === 'config' ? configRaw : configSchemaRaw
  const previewIsLive = configPreviewMode === 'config' ? configLive : configSchemaLive
  const previewJson = JSON.stringify(previewPayload, null, 2)
  const configObject = useMemo(() => {
    const value = unwrapPayload(configRaw)
    return isRecord(value) ? value : {}
  }, [configRaw])
  const configDraftFields = useMemo(() => buildDraftFields(configSchemaRaw), [configSchemaRaw])
  const initialDraftValues = useMemo(
    () => buildInitialDraftValues(configDraftFields, configObject),
    [configDraftFields, configObject],
  )
  const effectiveConfigDraft = useMemo(
    () => (configDraftDirty ? { ...initialDraftValues, ...configDraft } : initialDraftValues),
    [configDraft, configDraftDirty, initialDraftValues],
  )
  const configSections = useMemo(
    () => Array.from(new Set(configDraftFields.map((field) => field.section))),
    [configDraftFields],
  )
  const reportedPort = extractGatewayPort(gatewayUrl, presence.gatewayPort)
  const lastGatewayError = openclawClient.getLastError()
  const lastGatewayErrorDetails = openclawClient.getLastErrorDetails()
  const browserDeviceId = openclawClient.getDeviceId()
  const isLoopbackGateway = /^wss?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(gatewayUrl)
  const connectionWarnings = [
    !isLoopbackGateway && gatewayUrl.startsWith('ws://')
      ? 'Remote gateways should use wss:// instead of ws://.'
      : null,
    !isLoopbackGateway && !window.isSecureContext
      ? 'This browser context is not secure. Remote device auth flows may fail outside HTTPS.'
      : null,
  ].filter((warning): warning is string => Boolean(warning))
  const gatewayGuidance = buildGatewayGuidance(lastGatewayErrorDetails, isLoopbackGateway)
  const connectionDotColor =
    connectionStatus === 'connected'
      ? 'bg-success'
      : connectionStatus === 'connecting'
        ? 'bg-warning'
        : connectionStatus === 'error'
          ? 'bg-danger'
          : 'bg-text-tertiary'
  const isReconnectPending = reconnectAttempts > 0 && connectionStatus === 'connecting'
  const connectionMessage = reconnectAttempts === 0
    ? null
    : connectionStatus === 'connected'
      ? { type: 'success' as const, text: 'Connected to the OpenClaw gateway.' }
      : connectionStatus === 'connecting'
        ? { type: 'info' as const, text: 'Reconnect requested. Waiting for the gateway to respond...' }
        : { type: 'error' as const, text: lastGatewayError || 'Connection failed. Check the gateway URL, token, and local gateway state.' }

  const draftAnalysis = useMemo(() => {
    return analyzeConfigDraft(configDraftFields, configObject, effectiveConfigDraft)
  }, [configDraftFields, configObject, effectiveConfigDraft])
  const patchJson = JSON.stringify(draftAnalysis.patch, null, 2)
  const canCopyPatch = draftAnalysis.changes.length > 0 && draftAnalysis.invalidFields.length === 0

  const handleReconnect = () => {
    const nextUrl = gatewayUrl.trim() || 'ws://127.0.0.1:18789'
    const nextToken = gatewayToken.trim()

    setGatewayUrl(nextUrl)
    setReconnectAttempts(prev => prev + 1)
    openclawClient.connect(nextUrl, nextToken)
  }

  const handleDraftFieldChange = (path: string, value: DraftFieldValue) => {
    setConfigDraftDirty(true)
    setConfigDraft((current) => ({
      ...current,
      [path]: value,
    }))
  }

  const handleResetDraft = () => {
    setConfigDraftDirty(false)
    setConfigDraft({})
    setSettingsMessage({
      type: 'info',
      text: 'Reset the config draft back to the latest snapshot from config.get.',
    })
  }

  const handleCopyPatch = () => {
    if (!canCopyPatch) {
      setSettingsMessage({
        type: 'error',
        text: draftAnalysis.invalidFields.length > 0
          ? `Fix invalid fields before copying the patch payload: ${draftAnalysis.invalidFields.map((field) => field.label).join(', ')}.`
          : 'There are no config changes to copy yet.',
      })
      return
    }

    void copyTextToClipboard(patchJson).then((didCopy) => {
      setSettingsMessage(didCopy
        ? {
            type: 'success',
            text: 'Copied the config patch JSON to the clipboard.',
          }
        : {
            type: 'error',
            text: 'Clipboard access is unavailable in this browser context.',
          })
    })
  }

  const handlePrepareApply = () => {
    if (!canCopyPatch) {
      setSettingsMessage({
        type: 'info',
        text: draftAnalysis.invalidFields.length > 0
          ? 'This draft still contains invalid values. Fix them before preparing a gateway patch.'
          : 'No config changes are pending in the current draft.',
      })
      return
    }

    setSettingsMessage({
      type: 'info',
      text: configLive
        ? 'Patch payload prepared. Runtime apply stays gated until we verify config.patch / config.apply against a real OpenClaw gateway.'
        : 'Patch payload prepared from mock config data. Runtime apply will stay gated until a real gateway responds.',
    })
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <p className="text-xs text-text-tertiary">Configure your OpenClaw environment {isLive ? '(live status)' : '(mock fallback)'}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:gap-4">
        {/* Left: Tab Navigation */}
        <div className="w-full md:w-52 flex-shrink-0">
          <div className="glass rounded-2xl p-2 flex md:flex-col gap-0.5 overflow-x-auto">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 md:gap-2.5 px-3 py-2 md:py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 md:w-full ${
                  activeTab === id
                    ? 'bg-[var(--color-glass-bg)] shadow-sm text-accent'
                    : 'text-text-secondary hover:bg-[var(--color-glass-hover)] hover:text-text-primary'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Content */}
        <div className="flex-1 space-y-4">
          {settingsMessage && (
            <div className={`rounded-xl px-3 py-2 text-xs ${
              settingsMessage.type === 'success'
                ? 'bg-success/10 text-success'
                : settingsMessage.type === 'error'
                  ? 'bg-danger/10 text-danger'
                  : 'bg-info/10 text-info'
            }`}>
              {settingsMessage.text}
            </div>
          )}

          {activeTab === 'general' && (
            <>
              <GlassCard title="System Configuration" variant="strong">
                <div className="space-y-4">
                  <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
                    These fields are currently read-only previews. Change gateway-level defaults through your local config file or environment variables.
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">System Name</label>
                    <input
                      type="text"
                      defaultValue="OpenClaw Gateway"
                      disabled
                      className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">State Directory</label>
                    <input
                      type="text"
                      defaultValue="~/.openclaw/"
                      disabled
                      className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary font-mono outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1">Override with OPENCLAW_STATE_DIR environment variable</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Default Agent Model</label>
                    <select disabled className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/20 bg-transparent disabled:opacity-60 disabled:cursor-not-allowed">
                      <option>anthropic/claude-opus-4-6</option>
                      <option>anthropic/claude-sonnet-4-6</option>
                      <option>anthropic/claude-haiku-4-5</option>
                      <option>openai/gpt-4o</option>
                    </select>
                  </div>
                </div>
              </GlassCard>

              <GlassCard
                title="Config Draft Studio"
                subtitle="Schema-backed local editing, diff review, and patch generation"
                variant="strong"
              >
                <div className="space-y-4">
                  <div className={`rounded-xl px-3 py-2 text-xs ${(configLive && configSchemaLive) ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    {(configLive && configSchemaLive)
                      ? 'Editing against a live config/schema snapshot. Patch application still stays gated for safety.'
                      : 'Editing against mock config/schema data until a real OpenClaw gateway responds.'}
                  </div>

                  {configDraftFields.length === 0 ? (
                    <div className="rounded-xl px-3 py-2 text-xs bg-warning/10 text-warning">
                      No editable fields were discovered in the current schema payload yet.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {configSections.map((section) => (
                          <div key={section} className="glass-subtle rounded-2xl p-4 space-y-3">
                            <div>
                              <div className="text-xs font-semibold text-text-primary">{section}</div>
                              <div className="text-[10px] text-text-tertiary mt-0.5">
                                Generated from `config.schema` and seeded from `config.get`.
                              </div>
                            </div>
                            {configDraftFields.filter((field) => field.section === section).map((field) => {
                              const fieldValue = effectiveConfigDraft[field.path]
                              const isInvalid = draftAnalysis.invalidFields.some((item) => item.path === field.path)

                              return (
                                <label key={field.path} className="block">
                                  <span className="text-[11px] font-medium text-text-primary block mb-1.5">{field.label}</span>
                                  {field.kind === 'enum' ? (
                                    <select
                                      value={typeof fieldValue === 'string' ? fieldValue : ''}
                                      onChange={(event) => handleDraftFieldChange(field.path, event.target.value)}
                                      className="w-full glass-input rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent"
                                    >
                                      {(field.options || []).map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                      ))}
                                    </select>
                                  ) : field.kind === 'boolean' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDraftFieldChange(field.path, fieldValue !== true)}
                                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${
                                        fieldValue === true ? 'bg-success/10 text-success' : 'glass text-text-secondary'
                                      }`}
                                    >
                                      <span>{fieldValue === true ? 'Enabled' : 'Disabled'}</span>
                                      <span className={`w-2.5 h-2.5 rounded-full ${fieldValue === true ? 'bg-success' : 'bg-text-tertiary'}`} />
                                    </button>
                                  ) : field.kind === 'string-list' ? (
                                    <textarea
                                      value={typeof fieldValue === 'string' ? fieldValue : ''}
                                      onChange={(event) => handleDraftFieldChange(field.path, event.target.value)}
                                      rows={3}
                                      className="w-full glass-input rounded-xl px-3 py-2 text-sm text-text-primary outline-none resize-y"
                                    />
                                  ) : (
                                    <input
                                      type={field.kind === 'number' ? 'number' : 'text'}
                                      value={typeof fieldValue === 'string' ? fieldValue : ''}
                                      onChange={(event) => handleDraftFieldChange(field.path, event.target.value)}
                                      className={`w-full glass-input rounded-xl px-3 py-2 text-sm text-text-primary outline-none ${isInvalid ? 'ring-2 ring-danger/30' : ''}`}
                                    />
                                  )}
                                  <span className="text-[10px] text-text-tertiary mt-1 block font-mono">{field.path}</span>
                                  {field.description && (
                                    <span className="text-[10px] text-text-tertiary mt-1 block">{field.description}</span>
                                  )}
                                  {isInvalid && (
                                    <span className="text-[10px] text-danger mt-1 block">Enter a valid number before preparing the patch.</span>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        <div className="glass-subtle rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-text-primary">Draft Diff</div>
                              <div className="text-[10px] text-text-tertiary mt-0.5">
                                {draftAnalysis.changes.length} changed field{draftAnalysis.changes.length === 1 ? '' : 's'}
                              </div>
                            </div>
                            {configDraftDirty && (
                              <span className="text-[10px] px-2 py-1 rounded-full bg-info/10 text-info">local draft</span>
                            )}
                          </div>
                          {draftAnalysis.changes.length === 0 ? (
                            <div className="rounded-xl px-3 py-2 text-xs bg-[var(--color-glass-subtle)] text-text-secondary">
                              No config changes yet. Update a field above to generate a patch preview.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {draftAnalysis.changes.map(({ field, current, next }) => (
                                <div key={field.path} className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2 text-[11px] space-y-1">
                                  <div className="font-medium text-text-primary">{field.label}</div>
                                  <div className="text-text-tertiary font-mono">{field.path}</div>
                                  <div className="text-text-secondary">Current: {formatConfigValue(current)}</div>
                                  <div className="text-accent">Draft: {formatConfigValue(next)}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="glass-subtle rounded-2xl p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-text-primary">Patch Preview</div>
                              <div className="text-[10px] text-text-tertiary mt-0.5">
                                Generated nested payload for `config.patch`
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleResetDraft}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--color-glass-subtle)] text-text-secondary text-[11px] font-medium hover:text-accent transition-colors"
                              >
                                <RotateCcw size={12} />
                                Reset
                              </button>
                              <button
                                onClick={handleCopyPatch}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
                              >
                                <Copy size={12} />
                                Copy
                              </button>
                            </div>
                          </div>

                          <pre className="rounded-xl bg-[var(--color-code-bg)] text-[var(--color-code-text)] p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
                            {patchJson}
                          </pre>

                          <button
                            onClick={handlePrepareApply}
                            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors"
                          >
                            <Save size={14} />
                            Prepare Patch For Apply
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </GlassCard>

              <GlassCard
                title="Gateway Config Preview"
                subtitle="Live gateway configuration"
                action={(
                  <div className="flex items-center gap-1 p-1 glass rounded-xl">
                    {[
                      { id: 'config', label: 'Current' },
                      { id: 'schema', label: 'Schema' },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => setConfigPreviewMode(id as 'config' | 'schema')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                          configPreviewMode === id
                            ? 'bg-[var(--color-glass-bg)] text-text-primary shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              >
                <div className="space-y-3">
                  <div className={`rounded-xl px-3 py-2 text-xs ${previewIsLive ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    {previewIsLive
                      ? `Showing live ${configPreviewMode} payload from the gateway.`
                      : `Showing mock ${configPreviewMode} payload until a real OpenClaw gateway responds.`}
                  </div>
                  <pre className="glass-subtle rounded-xl p-3 text-[11px] text-text-primary overflow-x-auto whitespace-pre-wrap break-all">
                    {previewJson}
                  </pre>
                </div>
              </GlassCard>

              <GlassCard title="API Keys">
                <div className="space-y-3">
                  {[
                    { name: 'ANTHROPIC_API_KEY', set: true },
                    { name: 'OPENAI_API_KEY', set: false },
                    { name: 'BRAVE_API_KEY', set: true },
                    { name: 'ELEVENLABS_API_KEY', set: false },
                  ].map(({ name, set }) => (
                    <div key={name} className="flex items-center gap-3 p-3 rounded-xl glass-subtle">
                      <Key size={14} className={set ? 'text-success' : 'text-text-tertiary'} />
                      <div className="flex-1">
                        <div className="text-xs font-mono text-text-primary">{name}</div>
                        <div className="text-[10px] text-text-tertiary">{set ? 'Configured' : 'Not set'}</div>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${set ? 'bg-success' : 'bg-text-tertiary'}`} />
                      <button onClick={() => setSettingsMessage({ type: 'info', text: 'Editing provider API keys from the web UI is not wired yet.' })} className="text-[10px] text-accent hover:underline">
                        {set ? 'Update' : 'Set'}
                      </button>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </>
          )}

          {activeTab === 'connection' && (
            <>
              <GlassCard title="Gateway Connection" variant="strong">
                <div className="space-y-4">
                  {connectionMessage && (
                    <div className={`rounded-xl px-3 py-2 text-xs ${
                      connectionMessage.type === 'success'
                        ? 'bg-success/10 text-success'
                        : connectionMessage.type === 'error'
                          ? 'bg-danger/10 text-danger'
                          : 'bg-info/10 text-info'
                    }`}>
                      {connectionMessage.text}
                    </div>
                  )}

                  {connectionWarnings.map((warning) => (
                    <div key={warning} className="rounded-xl px-3 py-2 text-xs bg-warning/10 text-warning">
                      {warning}
                    </div>
                  ))}

                  {connectionStatus === 'error' && lastGatewayErrorDetails?.code && (
                    <div className="rounded-xl px-3 py-2 text-xs bg-danger/10 text-danger">
                      Gateway error code: <span className="font-mono">{lastGatewayErrorDetails.code}</span>
                    </div>
                  )}

                  {gatewayGuidance.map((notice) => (
                    <div
                      key={`${notice.type}:${notice.text}`}
                      className={`rounded-xl px-3 py-2 text-xs ${
                        notice.type === 'info'
                          ? 'bg-info/10 text-info'
                          : notice.type === 'error'
                            ? 'bg-danger/10 text-danger'
                            : 'bg-warning/10 text-warning'
                      }`}
                    >
                      {notice.text}
                    </div>
                  ))}

                  <div className="flex items-center gap-3 p-3 rounded-xl glass-subtle">
                    <span className={`w-3 h-3 rounded-full pulse-dot ${connectionDotColor}`} />
                    <div className="flex-1">
                      <div className="text-xs font-medium text-text-primary">
                        Status: {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
                      </div>
                      <div className="text-[10px] text-text-tertiary">{gatewayUrl}</div>
                    </div>
                    <button
                      onClick={handleReconnect}
                      disabled={isReconnectPending}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={12} />
                      Reconnect
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Gateway URL</label>
                    <input
                      type="text"
                      value={gatewayUrl}
                      onChange={(e) => setGatewayUrl(e.target.value)}
                      className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary font-mono outline-none focus:ring-2 focus:ring-accent/20"
                      placeholder="ws://127.0.0.1:18789"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Gateway Port</label>
                    <input
                      type="number"
                      value={reportedPort}
                      onChange={(event) => setGatewayUrl((current) => updateGatewayUrlPort(current, event.target.value, presence.gatewayPort))}
                      className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/20"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1">This updates the client reconnect target. The live gateway currently reports port {presence.gatewayPort}.</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Reported Bind Mode</label>
                    <div className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary">
                      {presence.bindMode}
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1">Shown from gateway presence. This build does not change server bind settings remotely.</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Browser Device ID</label>
                    <div className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary font-mono break-all">
                      {browserDeviceId}
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1">Use this ID to recognize this browser during pairing or device approval flows.</p>
                  </div>

                  <button
                    onClick={handleReconnect}
                    disabled={isReconnectPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Save size={14} />
                    Save & Reconnect
                  </button>
                </div>
              </GlassCard>

              <GlassCard title="Connected Nodes">
                <div className="space-y-2">
                  {nodes.map((node) => (
                    <div key={node.name} className="flex items-center gap-3 p-3 rounded-xl glass-subtle">
                      <Server size={14} className="text-accent" />
                      <div className="flex-1">
                        <div className="text-xs font-medium text-text-primary">{node.name}</div>
                        <div className="text-[10px] text-text-tertiary">{node.type} &middot; {node.ip || 'No IP reported'}</div>
                      </div>
                      <span className={`w-2 h-2 rounded-full ${node.status === 'Online' ? 'bg-success' : node.status === 'Idle' ? 'bg-warning' : 'bg-text-tertiary'}`} />
                    </div>
                  ))}
                  {nodes.length === 0 && (
                    <div className="text-center py-4 text-xs text-text-tertiary">No nodes reported by the gateway yet.</div>
                  )}
                </div>
              </GlassCard>

              <GlassCard title="Channel Status">
                <div className="space-y-2">
                  {channels.map((channel) => (
                    <div key={channel.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--color-glass-hover)] transition-colors">
                      <span className="text-base">{channel.provider.slice(0, 2).toUpperCase()}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary">{channel.name}</div>
                        <div className="text-[10px] text-text-tertiary truncate">
                          {channel.accountId || channel.dmPolicy || 'No additional channel details reported yet.'}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        channel.status === 'connected' ? 'bg-success/10 text-success' :
                        channel.status === 'error' ? 'bg-danger/10 text-danger' :
                        'bg-text-tertiary/10 text-text-tertiary'
                      }`}>
                        {channel.status}
                      </span>
                    </div>
                  ))}
                  {channels.length === 0 && (
                    <div className="text-center py-4 text-xs text-text-tertiary">No channel status has been reported yet.</div>
                  )}
                </div>
              </GlassCard>
            </>
          )}

          {activeTab === 'security' && (
            <>
              <GlassCard title="Authentication" variant="strong">
                <div className="space-y-4">
                  <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
                    Security controls are read-only in this build. You can reconnect with a different token, but server-side auth settings still come from the gateway config.
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Auth Mode</label>
                    <select disabled value={presence.authMode} className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none focus:ring-2 focus:ring-accent/20 bg-transparent disabled:opacity-60 disabled:cursor-not-allowed">
                      <option value="none">None</option>
                      <option value="token">Token</option>
                      <option value="password">Password</option>
                      <option value="trusted-proxy">Trusted Proxy</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Gateway Token</label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={gatewayToken}
                        onChange={(e) => setGatewayToken(e.target.value)}
                        className="w-full glass-subtle rounded-xl px-4 py-2.5 pr-12 text-sm text-text-primary font-mono outline-none focus:ring-2 focus:ring-accent/20"
                        placeholder="Enter gateway token..."
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-text-tertiary mt-1">Or set OPENCLAW_GATEWAY_TOKEN environment variable</p>
                    <p className="text-[10px] text-text-tertiary mt-1">Manual gateway tokens are now kept only for the current browser tab. Pair-issued device tokens are managed internally by the client.</p>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl glass-subtle">
                    <div className="flex items-center gap-2">
                      <Wifi size={14} className="text-accent" />
                      <div>
                        <div className="text-xs font-medium text-text-primary">Allow Tailscale</div>
                        <div className="text-[10px] text-text-tertiary">Tokenless access for tailnet clients</div>
                      </div>
                    </div>
                    <div className="w-10 h-5 rounded-full bg-success/20 relative cursor-not-allowed opacity-60">
                      <div className="w-4 h-4 rounded-full bg-success absolute top-0.5 right-0.5 shadow-sm" />
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard title="Rate Limiting">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-text-tertiary">Max Attempts</label>
                      <input disabled type="number" defaultValue={10} className="w-full glass-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none mt-1 disabled:opacity-60 disabled:cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary">Window (ms)</label>
                      <input disabled type="number" defaultValue={60000} className="w-full glass-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none mt-1 disabled:opacity-60 disabled:cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary">Lockout (ms)</label>
                      <input disabled type="number" defaultValue={300000} className="w-full glass-subtle rounded-lg px-3 py-2 text-sm text-text-primary outline-none mt-1 disabled:opacity-60 disabled:cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary">Exempt Loopback</label>
                      <div className="mt-1 flex items-center gap-2 glass-subtle rounded-lg px-3 py-2">
                        <CheckCircle size={14} className="text-success" />
                        <span className="text-sm text-text-primary">Yes</span>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard title="Sandbox Configuration">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Sandbox Mode</label>
                    <select disabled className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none bg-transparent disabled:opacity-60 disabled:cursor-not-allowed">
                      <option value="off">Off</option>
                      <option value="non-main">Non-main sessions</option>
                      <option value="all">All sessions</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1.5 block">Backend</label>
                    <select disabled className="w-full glass-subtle rounded-xl px-4 py-2.5 text-sm text-text-primary outline-none bg-transparent disabled:opacity-60 disabled:cursor-not-allowed">
                      <option value="docker">Docker</option>
                      <option value="ssh">SSH</option>
                      <option value="openshell">OpenShell</option>
                    </select>
                  </div>
                </div>
              </GlassCard>
            </>
          )}

          {activeTab === 'about' && (
            <>
              <GlassCard variant="strong" className="text-center py-10">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-light)] mx-auto mb-4 flex items-center justify-center shadow-lg">
                  <span className="text-white text-2xl font-bold">OC</span>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-1">OpenClaw</h3>
                <p className="text-xs text-text-tertiary mb-4">Web Control UI v1.0.0</p>

                <div className="space-y-2 max-w-xs mx-auto">
                  {[
                    { label: 'Gateway Version', value: `OpenClaw ${presence.version}` },
                    { label: 'Protocol', value: 'WebSocket v3' },
                    { label: 'Default Port', value: `${presence.gatewayPort}` },
                    { label: 'License', value: 'MIT' },
                    { label: 'Config', value: '~/.openclaw/openclaw.json' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2 border-b border-[var(--color-glass-border-subtle)] text-xs">
                      <span className="text-text-tertiary">{label}</span>
                      <span className="text-text-primary font-mono">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex justify-center gap-3">
                  <a
                    href="https://docs.openclaw.ai/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl glass text-xs text-text-secondary hover:text-accent transition-colors"
                  >
                    <Globe size={14} />
                    Documentation
                  </a>
                  <button
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl glass text-xs text-text-secondary hover:text-accent transition-colors"
                  >
                    <RefreshCw size={14} />
                    Reload UI
                  </button>
                </div>
              </GlassCard>

            </>
          )}
        </div>
      </div>
    </div>
  )
}
