import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCronScheduleRequest,
  buildDefaultJobMessages,
  deleteCronPreviewJob,
  recordCronPreviewRun,
  toggleCronPreviewJob,
  upsertCronPreviewJob,
  validateCronPreviewDraft,
  type CronPreviewState,
} from '../src/lib/cron-preview.ts'
import { mockCronJobs } from '../src/lib/mock-data.ts'

function createState(): CronPreviewState {
  return {
    jobs: structuredClone(mockCronJobs),
    messagesByJob: buildDefaultJobMessages(mockCronJobs),
    runHistoryByJob: {},
  }
}

test('cron preview draft validation catches missing required fields and invalid intervals', () => {
  assert.equal(validateCronPreviewDraft({
    name: '',
    schedule: '',
    scheduleType: 'cron',
    agentId: '',
    description: '',
    sessionTarget: 'isolated',
    message: '',
  }), 'Name, schedule, agent, and task message are required.')

  assert.equal(validateCronPreviewDraft({
    name: 'Heartbeat',
    schedule: 'abc',
    scheduleType: 'every',
    agentId: 'agent-06',
    description: '',
    sessionTarget: 'isolated',
    message: 'Run diagnostics',
  }), 'Interval schedules must be a valid number of milliseconds.')
})

test('cron preview schedule request parsing returns stable payloads', () => {
  assert.deepEqual(buildCronScheduleRequest('cron', '0 9 * * *'), { cron: '0 9 * * *' })
  assert.deepEqual(buildCronScheduleRequest('every', '60000'), { every: 60000 })
  assert.deepEqual(buildCronScheduleRequest('at', '2026-04-01T09:00:00Z'), { at: '2026-04-01T09:00:00Z' })
  assert.equal(buildCronScheduleRequest('every', 'invalid'), null)
})

test('cron preview create, update, toggle, run, and delete flow stays consistent', () => {
  const initial = createState()

  const created = upsertCronPreviewJob(initial, {
    name: 'Nightly Sync',
    schedule: '0 1 * * *',
    scheduleType: 'cron',
    agentId: 'agent-06',
    description: 'Sync nightly reports',
    sessionTarget: 'isolated',
    message: 'Generate the nightly report and sync the archive.',
  })

  assert.equal(created.mode, 'created')
  assert.equal(created.selectedJobId.startsWith('cron-nightly-sync'), true)
  assert.equal(created.state.jobs[0].name, 'Nightly Sync')
  assert.equal(created.state.messagesByJob[created.selectedJobId], 'Generate the nightly report and sync the archive.')

  const updated = upsertCronPreviewJob(created.state, {
    name: 'Nightly Sync Updated',
    schedule: '300000',
    scheduleType: 'every',
    agentId: 'agent-01',
    description: 'Updated description',
    sessionTarget: 'main',
    message: 'Run the updated workflow.',
  }, created.selectedJobId)

  const updatedJob = updated.state.jobs.find((job) => job.id === created.selectedJobId)
  assert.equal(updated.mode, 'updated')
  assert.equal(updatedJob?.name, 'Nightly Sync Updated')
  assert.equal(updatedJob?.scheduleType, 'every')
  assert.equal(updatedJob?.agentId, 'agent-01')
  assert.equal(updated.state.messagesByJob[created.selectedJobId], 'Run the updated workflow.')

  const toggledJobs = toggleCronPreviewJob(updated.state.jobs, created.selectedJobId)
  const toggledJob = toggledJobs.find((job) => job.id === created.selectedJobId)
  assert.equal(toggledJob?.enabled, false)
  assert.equal(toggledJob?.status, 'pending')

  const ranState = recordCronPreviewRun(
    {
      ...updated.state,
      jobs: toggledJobs,
    },
    toggledJob!,
    '2026-03-25 10:00:00',
  )
  const ranJob = ranState.jobs.find((job) => job.id === created.selectedJobId)
  assert.equal(ranJob?.lastRun, 'Just now')
  assert.equal(ranJob?.status, 'ok')
  assert.equal(ranState.runHistoryByJob[created.selectedJobId]?.length, 1)
  assert.equal(ranState.runHistoryByJob[created.selectedJobId]?.[0]?.ranAt, '2026-03-25 10:00:00')

  const deletedState = deleteCronPreviewJob(ranState, created.selectedJobId)
  assert.equal(deletedState.jobs.some((job) => job.id === created.selectedJobId), false)
  assert.equal(created.selectedJobId in deletedState.messagesByJob, false)
  assert.equal(created.selectedJobId in deletedState.runHistoryByJob, false)
})
