import { useEffect, useState } from 'react'
import {
  Plus,
  Play,
  Pause,
  Trash2,
  ChevronRight,
  CalendarClock,
  MoreHorizontal,
  CheckCircle,
  AlertTriangle,
  Search,
  Bot,
  PencilLine,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { useGatewayData, useGatewayAction } from '../hooks/useOpenClaw'
import { normalizeAgents, normalizeSessions } from '../lib/openclaw-adapters'
import {
  buildCronScheduleRequest,
  buildDefaultJobMessages,
  deleteCronPreviewJob,
  recordCronPreviewRun,
  toggleCronPreviewJob,
  type CronPreviewDraft,
  type LocalRunHistoryEntry,
  upsertCronPreviewJob,
  validateCronPreviewDraft,
} from '../lib/cron-preview'
import { mockCronJobs, mockAgents, mockSessions, type CronJob } from '../lib/mock-data'

const statusStyles: Record<string, string> = {
  ok: 'bg-success/10 text-success',
  error: 'bg-danger/10 text-danger',
  pending: 'bg-text-tertiary/10 text-text-tertiary',
}

const CRON_PREVIEW_JOBS_KEY = 'openclaw_ui_cron_preview_jobs_v1'
const CRON_PREVIEW_MESSAGES_KEY = 'openclaw_ui_cron_preview_messages_v1'
const CRON_PREVIEW_RUN_HISTORY_KEY = 'openclaw_ui_cron_preview_run_history_v1'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asStr(v: unknown, fb = ''): string { return typeof v === 'string' ? v : fb }

function normalizeCronJob(value: unknown): CronJob | null {
  if (!isRecord(value)) return null
  const id = asStr(value.id || value.jobId)
  const name = asStr(value.name || value.label || value.id)
  if (!id) return null

  const rawScheduleType = asStr(value.scheduleType || value.type, 'cron')
  const scheduleType: CronJob['scheduleType'] =
    rawScheduleType === 'every' || rawScheduleType === 'at' ? rawScheduleType : 'cron'

  const rawStatus = asStr(value.status || value.state, 'ok').toLowerCase()
  const status: CronJob['status'] =
    rawStatus.includes('error') || rawStatus.includes('fail') ? 'error'
    : rawStatus.includes('pend') || rawStatus.includes('disabled') ? 'pending'
    : 'ok'

  return {
    id,
    name,
    schedule: asStr(value.schedule || value.cron || value.expression),
    scheduleType,
    agentId: asStr(value.agentId || value.agent, 'main'),
    enabled: value.enabled === false ? false : status !== 'pending',
    lastRun: asStr(value.lastRun || value.lastRunAt) || undefined,
    nextRun: asStr(value.nextRun || value.nextRunAt) || undefined,
    status,
    description: asStr(value.description || value.message) || undefined,
    sessionTarget: asStr(value.sessionTarget || value.target, 'isolated'),
  }
}

function isCronJob(value: unknown): value is CronJob {
  return normalizeCronJob(value) !== null
}

function isLocalRunHistoryEntry(value: unknown): value is LocalRunHistoryEntry {
  return isRecord(value) &&
    ['preview', 'success', 'error'].includes(value.status as string) &&
    ['id', 'ranAt', 'source', 'note'].every((field) => typeof value[field] === 'string')
}

function loadStoredValue<T>(key: string, fallback: T, validator?: (value: unknown) => value is T): T {
  if (!canUseStorage()) return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback

    const parsed = JSON.parse(raw)
    if (validator && !validator(parsed)) {
      return fallback
    }
    return parsed as T
  } catch {
    return fallback
  }
}

function persistStoredValue<T>(key: string, value: T) {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export default function Cron() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingJobId, setEditingJobId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const [localPreviewJobs, setLocalPreviewJobs] = useState<CronJob[]>(() => loadStoredValue(
    CRON_PREVIEW_JOBS_KEY,
    mockCronJobs,
    (value): value is CronJob[] => Array.isArray(value) && value.every(isCronJob),
  ))
  const [localJobMessages, setLocalJobMessages] = useState<Record<string, string>>(() => (
    loadStoredValue(
      CRON_PREVIEW_MESSAGES_KEY,
      buildDefaultJobMessages(mockCronJobs),
      (value): value is Record<string, string> => (
        isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string')
      ),
    )
  ))
  const [localRunHistoryByJob, setLocalRunHistoryByJob] = useState<Record<string, LocalRunHistoryEntry[]>>(() => (
    loadStoredValue(
      CRON_PREVIEW_RUN_HISTORY_KEY,
      {},
      (value): value is Record<string, LocalRunHistoryEntry[]> => (
        isRecord(value) && Object.values(value).every((entry) => Array.isArray(entry) && entry.every(isLocalRunHistoryEntry))
      ),
    )
  ))
  const { execute: rpcAction, isConnected, loading: isActionLoading, error: actionError } = useGatewayAction()

  const [formName, setFormName] = useState('')
  const [formSchedule, setFormSchedule] = useState('')
  const [formScheduleType, setFormScheduleType] = useState<'cron' | 'every' | 'at'>('cron')
  const [formAgent, setFormAgent] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formSessionTarget, setFormSessionTarget] = useState('isolated')
  const [formMessage, setFormMessage] = useState('')

  const { data: cronJobsRaw, isLive, refetch } = useGatewayData<unknown>('cron.list', {}, mockCronJobs, 15000)
  // cron.list returns { jobs: [...] } — extract and normalize
  const cronJobs: CronJob[] = (() => {
    const raw = isRecord(cronJobsRaw) && Array.isArray((cronJobsRaw as Record<string, unknown>).jobs)
      ? (cronJobsRaw as Record<string, unknown>).jobs as unknown[]
      : Array.isArray(cronJobsRaw) ? cronJobsRaw : null
    if (!raw) return mockCronJobs
    const normalized = raw.map(normalizeCronJob).filter((j): j is CronJob => j !== null)
    return normalized.length > 0 ? normalized : (isLive ? [] : mockCronJobs)
  })()
  const { data: sessionsRaw } = useGatewayData<unknown>('sessions.list', {}, mockSessions, 10000)
  const { data: agentsListRaw } = useGatewayData<unknown>('agents.list', {}, { agents: mockAgents }, 15000)
  const sessions = normalizeSessions(sessionsRaw, mockSessions)
  const agents = normalizeAgents(agentsListRaw, sessions, mockAgents)
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]))
  const jobs = isLive ? cronJobs : localPreviewJobs
  const isPreviewMode = !isLive
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null
  const selectedRunHistory = selectedJob ? localRunHistoryByJob[selectedJob.id] || [] : []

  const filtered = jobs.filter((job) =>
    job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.id.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  useEffect(() => {
    persistStoredValue(CRON_PREVIEW_JOBS_KEY, localPreviewJobs)
  }, [localPreviewJobs])

  useEffect(() => {
    persistStoredValue(CRON_PREVIEW_MESSAGES_KEY, localJobMessages)
  }, [localJobMessages])

  useEffect(() => {
    persistStoredValue(CRON_PREVIEW_RUN_HISTORY_KEY, localRunHistoryByJob)
  }, [localRunHistoryByJob])

  const resetForm = () => {
    setFormName('')
    setFormSchedule('')
    setFormScheduleType('cron')
    setFormAgent('')
    setFormDescription('')
    setFormSessionTarget('isolated')
    setFormMessage('')
    setEditingJobId(null)
  }

  const openCreateForm = () => {
    resetForm()
    setShowCreateForm(true)
    setActionMessage(null)
  }

  const openEditForm = (job: CronJob) => {
    if (!isPreviewMode) {
      setActionMessage({
        type: 'info',
        text: 'Live job editing is waiting on verified gateway contract details. You can still edit jobs in local preview mode.',
      })
      return
    }

    setEditingJobId(job.id)
    setFormName(job.name)
    setFormSchedule(job.schedule)
    setFormScheduleType(job.scheduleType)
    setFormAgent(job.agentId)
    setFormDescription(job.description || '')
    setFormSessionTarget(job.sessionTarget)
    setFormMessage(localJobMessages[job.id] || '')
    setShowCreateForm(true)
    setActionMessage({
      type: 'info',
      text: `Editing local preview job "${job.name}". Changes will stay in this browser until a real gateway is available.`,
    })
  }

  const handleToggle = async (job: CronJob) => {
    if (isPreviewMode || !isConnected) {
      setLocalPreviewJobs((current) => toggleCronPreviewJob(current, job.id))
      setActionMessage({
        type: 'success',
        text: `Updated local preview job "${job.name}". This change is only stored in the browser for now.`,
      })
      return
    }

    await rpcAction('cron.update', { jobId: job.id, patch: { enabled: !job.enabled } })
    refetch()
    setActionMessage({ type: 'success', text: `Updated "${job.name}".` })
  }

  const handleDelete = async (job: CronJob) => {
    if (isPreviewMode || !isConnected) {
      const nextState = deleteCronPreviewJob({
        jobs: localPreviewJobs,
        messagesByJob: localJobMessages,
        runHistoryByJob: localRunHistoryByJob,
      }, job.id)
      setLocalPreviewJobs(nextState.jobs)
      setLocalRunHistoryByJob(nextState.runHistoryByJob)
      setLocalJobMessages(nextState.messagesByJob)
      setSelectedJobId((current) => (current === job.id ? null : current))
      if (editingJobId === job.id) {
        setShowCreateForm(false)
        resetForm()
      }
      setActionMessage({
        type: 'success',
        text: `Removed local preview job "${job.name}".`,
      })
      return
    }

    await rpcAction('cron.remove', { jobId: job.id })
    refetch()
    setSelectedJobId(null)
    setActionMessage({ type: 'success', text: `Deleted "${job.name}".` })
  }

  const handleRunNow = async (job: CronJob) => {
    if (isPreviewMode || !isConnected) {
      const nextState = recordCronPreviewRun({
        jobs: localPreviewJobs,
        messagesByJob: localJobMessages,
        runHistoryByJob: localRunHistoryByJob,
      }, job)
      setLocalPreviewJobs(nextState.jobs)
      setLocalRunHistoryByJob(nextState.runHistoryByJob)
      setActionMessage({
        type: 'success',
        text: `Ran "${job.name}" in local preview mode.`,
      })
      return
    }

    await rpcAction('cron.run', { jobId: job.id, force: true })
    setActionMessage({ type: 'success', text: `Started "${job.name}".` })
  }

  const handleSubmitForm = async () => {
    const draft: CronPreviewDraft = {
      name: formName,
      schedule: formSchedule,
      scheduleType: formScheduleType,
      agentId: formAgent,
      description: formDescription,
      sessionTarget: formSessionTarget,
      message: formMessage,
    }
    const validationError = validateCronPreviewDraft(draft)

    if (validationError) {
      setActionMessage({ type: 'error', text: validationError })
      return
    }

    if (isPreviewMode || !isConnected) {
      const result = upsertCronPreviewJob({
        jobs: localPreviewJobs,
        messagesByJob: localJobMessages,
        runHistoryByJob: localRunHistoryByJob,
      }, draft, editingJobId)
      setLocalPreviewJobs(result.state.jobs)
      setLocalJobMessages(result.state.messagesByJob)
      setSelectedJobId(result.selectedJobId)
      setActionMessage({
        type: 'success',
        text: result.mode === 'updated'
          ? `Updated local preview job "${draft.name.trim()}".`
          : `Created local preview job "${draft.name.trim()}".`,
      })

      setShowCreateForm(false)
      resetForm()
      return
    }

    if (editingJobId) {
      setActionMessage({
        type: 'info',
        text: 'Live job editing is still waiting on verified gateway update semantics. Creation and quick actions remain available.',
      })
      return
    }

    const schedule = buildCronScheduleRequest(formScheduleType, formSchedule)
    if (!schedule) {
      setActionMessage({ type: 'error', text: 'Interval schedules must be a valid number of milliseconds.' })
      return
    }

    const result = await rpcAction('cron.add', {
      name: draft.name.trim(),
      schedule,
      agentId: draft.agentId,
      description: draft.description.trim(),
      sessionTarget: draft.sessionTarget,
      payload: { type: 'agentTurn', message: draft.message.trim() },
    })

    if (!result) return

    refetch()
    setShowCreateForm(false)
    resetForm()
    setActionMessage({ type: 'success', text: 'Scheduled task created.' })
  }

  return (
    <div className="space-y-3 md:space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Scheduled Tasks</h2>
          <p className="text-xs text-text-tertiary">
            {jobs.length} jobs, {jobs.filter((job) => job.enabled).length} active
            {!isLive && <span className="text-warning ml-1">(local preview)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-input text-xs flex-1 sm:flex-initial">
            <Search size={14} className="text-text-tertiary" />
            <input
              type="text"
              placeholder="Search jobs..."
              className="bg-transparent outline-none text-text-primary placeholder-text-tertiary w-full sm:w-40"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors"
          >
            <Plus size={14} />
            New Job
          </button>
        </div>
      </div>

      {(actionMessage || actionError) && (
        <div className={`rounded-xl px-3 py-2 text-xs ${
          actionError || actionMessage?.type === 'error'
            ? 'bg-danger/10 text-danger'
            : actionMessage?.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-info/10 text-info'
        }`}>
          {actionError || actionMessage?.text}
        </div>
      )}

      {isPreviewMode && (
        <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
          Preview mode is active. Creating, editing, deleting, and running jobs will stay inside this browser until a real OpenClaw gateway is available.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        <div className={selectedJob || showCreateForm ? 'lg:col-span-7' : 'lg:col-span-12'}>
          <GlassCard padding="sm">
            <div className="space-y-1">
              {filtered.map((job) => (
                <div
                  key={job.id}
                  onClick={() => {
                    setSelectedJobId(job.id)
                    setShowCreateForm(false)
                  }}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    selectedJobId === job.id ? 'bg-accent/5' : 'hover:bg-[var(--color-glass-hover)]'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    job.enabled ? 'bg-accent/10' : 'bg-[var(--color-glass-border)]'
                  }`}>
                    <CalendarClock size={18} className={job.enabled ? 'text-accent' : 'text-text-tertiary'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{job.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyles[job.status]}`}>{job.status}</span>
                    </div>
                    <div className="text-[10px] text-text-tertiary mt-0.5">
                      <span className="font-mono">{job.schedule}</span>
                      {job.description && <span className="ml-2">&middot; {job.description}</span>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 hidden sm:block">
                    <div className="text-[10px] text-text-tertiary">Next: {job.nextRun || 'N/A'}</div>
                    <div className="text-[10px] text-text-tertiary/60">Last: {job.lastRun || 'Never'}</div>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleToggle(job)
                    }}
                    disabled={!isPreviewMode && (!isConnected || isActionLoading)}
                    className={`w-9 h-5 rounded-full relative flex-shrink-0 transition-colors ${
                      job.enabled ? 'bg-success/30' : 'bg-[var(--color-glass-border)]'
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    <div className={`w-4 h-4 rounded-full absolute top-0.5 transition-all shadow-sm ${
                      job.enabled ? 'right-0.5 bg-success' : 'left-0.5 bg-text-tertiary'
                    }`} />
                  </button>
                  <ChevronRight size={14} className="text-text-tertiary flex-shrink-0" />
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-text-tertiary text-xs">
                  No scheduled tasks found
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {(selectedJob || showCreateForm) && (
          <div className="lg:col-span-5 space-y-3 animate-slide-in">
            {showCreateForm ? (
              <GlassCard title={editingJobId ? 'Edit Scheduled Task' : 'Create Scheduled Task'} variant="strong">
                <div className="space-y-3">
                  {editingJobId && (
                    <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
                      You are editing a local preview job. Live gateway editing stays gated until the exact contract is verified.
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1 block">Name</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(event) => setFormName(event.target.value)}
                      placeholder="e.g. Daily Report"
                      className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1 block">Schedule Type</label>
                    <div className="flex gap-1">
                      {(['cron', 'every', 'at'] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => setFormScheduleType(type)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                            formScheduleType === type ? 'bg-accent text-white' : 'glass-subtle text-text-secondary'
                          }`}
                        >
                          {type === 'cron' ? 'Cron' : type === 'every' ? 'Interval' : 'One-shot'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1 block">
                      {formScheduleType === 'cron' ? 'Cron Expression' : formScheduleType === 'every' ? 'Interval (ms)' : 'ISO 8601 Timestamp'}
                    </label>
                    <input
                      type="text"
                      value={formSchedule}
                      onChange={(event) => setFormSchedule(event.target.value)}
                      placeholder={formScheduleType === 'cron' ? '0 9 * * *' : formScheduleType === 'every' ? '3600000' : '2026-04-01T09:00:00Z'}
                      className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1 block">Agent</label>
                    <select
                      value={formAgent}
                      onChange={(event) => setFormAgent(event.target.value)}
                      className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent"
                    >
                      <option value="">Select agent...</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.id})
                        </option>
                      ))}
                    </select>
                    {agents.length === 0 && (
                      <p className="text-[10px] text-text-tertiary mt-1">No agents are available from the current gateway state.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1 block">Session Target</label>
                    <select
                      value={formSessionTarget}
                      onChange={(event) => setFormSessionTarget(event.target.value)}
                      className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none bg-transparent"
                    >
                      <option value="main">Main</option>
                      <option value="isolated">Isolated</option>
                      <option value="current">Current</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1 block">Task Message</label>
                    <textarea
                      value={formMessage}
                      onChange={(event) => setFormMessage(event.target.value)}
                      placeholder="What should the agent do?"
                      className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none resize-none"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-primary mb-1 block">Description</label>
                    <input
                      type="text"
                      value={formDescription}
                      onChange={(event) => setFormDescription(event.target.value)}
                      placeholder="Optional description"
                      className="w-full glass-subtle rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => void handleSubmitForm()}
                      disabled={isActionLoading}
                      className="flex-1 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {editingJobId ? 'Save Changes' : 'Create Job'}
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateForm(false)
                        resetForm()
                      }}
                      className="px-4 py-2 rounded-xl glass text-xs text-text-secondary hover:text-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </GlassCard>
            ) : selectedJob && (
              <>
                <GlassCard variant="strong">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                        <CalendarClock size={18} className="text-accent" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">{selectedJob.name}</h4>
                        <p className="text-[10px] text-text-tertiary">{selectedJob.id}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedJobId(null)} className="text-text-tertiary hover:text-text-secondary">
                      <MoreHorizontal size={16} />
                    </button>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Schedule</div>
                        <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-primary">{selectedJob.schedule}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Type</div>
                        <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs text-text-primary">{selectedJob.scheduleType}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Agent</div>
                      <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs text-text-primary flex items-center gap-2">
                        <Bot size={12} className="text-accent" />
                        {agentsById.get(selectedJob.agentId)?.name || selectedJob.agentId}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Session Target</div>
                      <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs text-text-primary">{selectedJob.sessionTarget}</div>
                    </div>
                    {selectedJob.description && (
                      <div>
                        <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Description</div>
                        <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs text-text-secondary">{selectedJob.description}</div>
                      </div>
                    )}
                    {localJobMessages[selectedJob.id] && (
                      <div>
                        <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Task Message</div>
                        <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs text-text-secondary whitespace-pre-wrap">
                          {localJobMessages[selectedJob.id]}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditForm(selectedJob)}
                      className="w-9 h-9 rounded-xl glass flex items-center justify-center text-text-secondary hover:text-accent transition-colors"
                    >
                      <PencilLine size={15} />
                    </button>
                    <button
                      onClick={() => void handleRunNow(selectedJob)}
                      disabled={!isPreviewMode && (!isConnected || isActionLoading)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Play size={13} />
                      Run Now
                    </button>
                    <button
                      onClick={() => void handleToggle(selectedJob)}
                      disabled={!isPreviewMode && (!isConnected || isActionLoading)}
                      className="w-9 h-9 rounded-xl glass flex items-center justify-center text-text-secondary hover:text-warning transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {selectedJob.enabled ? <Pause size={15} /> : <Play size={15} />}
                    </button>
                    <button
                      onClick={() => void handleDelete(selectedJob)}
                      disabled={!isPreviewMode && (!isConnected || isActionLoading)}
                      className="w-9 h-9 rounded-xl glass flex items-center justify-center text-text-secondary hover:text-danger transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </GlassCard>

                <GlassCard title="Run History" padding="sm">
                  {!isPreviewMode ? (
                    <div className="rounded-xl px-3 py-2 text-xs bg-warning/10 text-warning">
                      Live run history is not exposed by the current gateway snapshot yet. This panel will switch to real execution traces after runtime wiring is verified.
                    </div>
                  ) : selectedRunHistory.length === 0 ? (
                    <div className="rounded-xl px-3 py-2 text-xs bg-[var(--color-glass-subtle)] text-text-secondary">
                      No local preview runs yet. Use `Run Now` to simulate a browser-side execution trace for this job.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedRunHistory.map((run) => (
                        <div key={run.id} className="p-3 rounded-xl glass-subtle text-[10px] space-y-1.5">
                          <div className="flex items-center gap-2">
                            {run.status === 'error' ? (
                              <AlertTriangle size={12} className="text-danger flex-shrink-0" />
                            ) : (
                              <CheckCircle size={12} className="text-success flex-shrink-0" />
                            )}
                            <span className="text-text-primary font-medium flex-1">{run.ranAt}</span>
                            <span className="px-2 py-0.5 rounded-full bg-info/10 text-info">{run.source}</span>
                          </div>
                          <div className="text-text-secondary">{run.note}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
