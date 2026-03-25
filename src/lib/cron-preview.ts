import type { CronJob } from './mock-data.ts'

export type LocalRunHistoryEntry = {
  id: string
  ranAt: string
  status: 'preview' | 'success' | 'error'
  source: string
  note: string
}

export interface CronPreviewDraft {
  name: string
  schedule: string
  scheduleType: CronJob['scheduleType']
  agentId: string
  description: string
  sessionTarget: string
  message: string
}

export interface CronPreviewState {
  jobs: CronJob[]
  messagesByJob: Record<string, string>
  runHistoryByJob: Record<string, LocalRunHistoryEntry[]>
}

export type CronScheduleRequest =
  | { cron: string }
  | { every: number }
  | { at: string }

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'scheduled-job'
}

export function createPreviewTimestamp(): string {
  return new Date().toLocaleString()
}

export function buildDefaultJobMessages(jobs: CronJob[]): Record<string, string> {
  return Object.fromEntries(
    jobs.map((job) => [job.id, job.description || `Run scheduled task "${job.name}".`]),
  )
}

export function validateCronPreviewDraft(draft: CronPreviewDraft): string | null {
  if (!draft.name.trim() || !draft.schedule.trim() || !draft.agentId.trim() || !draft.message.trim()) {
    return 'Name, schedule, agent, and task message are required.'
  }

  if (draft.scheduleType === 'every') {
    const intervalMs = Number.parseInt(draft.schedule, 10)
    if (Number.isNaN(intervalMs)) {
      return 'Interval schedules must be a valid number of milliseconds.'
    }
  }

  return null
}

export function buildCronScheduleRequest(
  scheduleType: CronJob['scheduleType'],
  schedule: string,
): CronScheduleRequest | null {
  const trimmed = schedule.trim()

  if (scheduleType === 'cron') {
    return { cron: trimmed }
  }

  if (scheduleType === 'every') {
    const every = Number.parseInt(trimmed, 10)
    if (Number.isNaN(every)) {
      return null
    }
    return { every }
  }

  return { at: trimmed }
}

export function upsertCronPreviewJob(
  state: CronPreviewState,
  draft: CronPreviewDraft,
  editingJobId?: string | null,
): { state: CronPreviewState; selectedJobId: string; mode: 'created' | 'updated' } {
  const trimmedName = draft.name.trim()
  const trimmedSchedule = draft.schedule.trim()
  const trimmedDescription = draft.description.trim()
  const trimmedMessage = draft.message.trim()

  if (editingJobId) {
    return {
      mode: 'updated',
      selectedJobId: editingJobId,
      state: {
        ...state,
        jobs: state.jobs.map((job) => (
          job.id === editingJobId
            ? {
                ...job,
                name: trimmedName,
                schedule: trimmedSchedule,
                scheduleType: draft.scheduleType,
                agentId: draft.agentId,
                description: trimmedDescription,
                sessionTarget: draft.sessionTarget,
              }
            : job
        )),
        messagesByJob: {
          ...state.messagesByJob,
          [editingJobId]: trimmedMessage,
        },
      },
    }
  }

  const baseId = slugify(trimmedName)
  let nextId = `cron-${baseId}`
  let suffix = 1
  while (state.jobs.some((job) => job.id === nextId)) {
    suffix += 1
    nextId = `cron-${baseId}-${suffix}`
  }

  const nextJob: CronJob = {
    id: nextId,
    name: trimmedName,
    schedule: trimmedSchedule,
    scheduleType: draft.scheduleType,
    agentId: draft.agentId,
    enabled: true,
    lastRun: undefined,
    nextRun: 'Preview only',
    status: 'pending',
    description: trimmedDescription,
    sessionTarget: draft.sessionTarget,
  }

  return {
    mode: 'created',
    selectedJobId: nextId,
    state: {
      ...state,
      jobs: [nextJob, ...state.jobs],
      messagesByJob: {
        ...state.messagesByJob,
        [nextId]: trimmedMessage,
      },
    },
  }
}

export function toggleCronPreviewJob(jobs: CronJob[], jobId: string): CronJob[] {
  return jobs.map((job) => (
    job.id === jobId
      ? {
          ...job,
          enabled: !job.enabled,
          status: !job.enabled ? 'ok' : 'pending',
        }
      : job
  ))
}

export function deleteCronPreviewJob(state: CronPreviewState, jobId: string): CronPreviewState {
  const nextHistory = { ...state.runHistoryByJob }
  delete nextHistory[jobId]

  const nextMessages = { ...state.messagesByJob }
  delete nextMessages[jobId]

  return {
    jobs: state.jobs.filter((job) => job.id !== jobId),
    messagesByJob: nextMessages,
    runHistoryByJob: nextHistory,
  }
}

export function recordCronPreviewRun(
  state: CronPreviewState,
  job: CronJob,
  ranAt = createPreviewTimestamp(),
): CronPreviewState {
  const runEntry: LocalRunHistoryEntry = {
    id: `${job.id}:${Date.now()}`,
    ranAt,
    status: 'preview',
    source: 'local preview',
    note: 'Executed in browser preview mode. Runtime logs, duration, and token counts will appear after live gateway wiring.',
  }

  return {
    ...state,
    jobs: state.jobs.map((item) => (
      item.id === job.id
        ? {
            ...item,
            lastRun: 'Just now',
            status: 'ok',
          }
        : item
    )),
    runHistoryByJob: {
      ...state.runHistoryByJob,
      [job.id]: [runEntry, ...(state.runHistoryByJob[job.id] || [])],
    },
  }
}
