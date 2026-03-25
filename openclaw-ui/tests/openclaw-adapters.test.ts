import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeMessages,
  normalizePresence,
  normalizeSkills,
  normalizeSessions,
} from '../src/lib/openclaw-adapters.ts'

test('normalizeSessions unwraps payloads and maps token/session fields', () => {
  const sessions = normalizeSessions({
    payload: {
      sessions: [
        {
          sessionId: 'session-1',
          key: 'agent:planner:main',
          agentId: 'planner',
          agentName: 'Planning Agent',
          preview: 'Ready to plan',
          updatedAt: '2026-03-25T08:00:00Z',
          type: 'cron',
          modelId: 'claude-sonnet',
          promptTokens: '2048',
          maxContextTokens: '8192',
          unread: 'true',
        },
      ],
    },
  }, [])

  assert.equal(sessions.length, 1)
  assert.deepEqual(sessions[0], {
    id: 'session-1',
    key: 'agent:planner:main',
    title: 'Planning Agent',
    agent: 'Planning Agent',
    agentId: 'planner',
    lastMessage: 'Ready to plan',
    timestamp: '2026-03-25T08:00:00Z',
    unread: true,
    kind: 'cron',
    model: 'claude-sonnet',
    contextTokens: 2048,
    totalTokens: 8192,
  })
})

test('normalizeMessages extracts tool calls, thinking, and text content', () => {
  const messages = normalizeMessages({
    data: {
      history: [
        {
          messageId: 'm-1',
          role: 'assistant',
          content: [{ text: 'First line' }, { text: 'Second line' }],
          createdAt: '10:30 AM',
          agentName: 'Reviewer',
          reasoning: 'Checked the diff and summarized the risk.',
          tool_calls: [
            {
              name: 'read_file',
              arguments: '{"path":"src/App.tsx"}',
              duration: '18ms',
            },
          ],
        },
      ],
    },
  }, [])

  assert.equal(messages.length, 1)
  assert.equal(messages[0].content, 'First line\nSecond line')
  assert.equal(messages[0].agent, 'Reviewer')
  assert.equal(messages[0].thinking, 'Checked the diff and summarized the risk.')
  assert.deepEqual(messages[0].toolCalls, [
    {
      tool: 'read_file',
      args: '{"path":"src/App.tsx"}',
      time: '18ms',
    },
  ])
})

test('normalizePresence and normalizeSkills infer stable values from mixed snapshots', () => {
  const sessions = normalizeSessions({
    sessions: [
      { id: 's-1', key: 'agent:a:main', agentId: 'agent-a', agent: 'Agent A', contextTokens: 100 },
      { id: 's-2', key: 'agent:b:main', agentId: 'agent-b', agent: 'Agent B', contextTokens: 200 },
    ],
  }, [])
  const skills = normalizeSkills(
    {
      bins: [
        { id: 'web-search', name: 'Web Search', version: '3.1.0', installed: true, usage: 42 },
      ],
    },
    {
      tools: [
        { name: 'shell-exec', description: 'Shell runtime access', calls: 8 },
      ],
    },
    [],
  )

  const presence = normalizePresence({
    result: {
      version: '3.2.1',
      cpuUsage: '22',
      memoryUsage: '48',
      latency: '19',
      agents: [
        { id: 'agent-a', status: 'running' },
        { id: 'agent-b', status: 'idle' },
      ],
      port: '18789',
      bindAddress: '127.0.0.1',
      auth: 'token',
    },
  }, sessions, skills)

  assert.equal(skills.length, 2)
  assert.equal(skills.find((skill) => skill.id === 'web-search')?.category, 'api')
  assert.equal(skills.find((skill) => skill.id === 'shell-exec')?.category, 'system')

  assert.equal(presence.version, '3.2.1')
  assert.equal(presence.cpu, 22)
  assert.equal(presence.memory, 48)
  assert.equal(presence.networkLatency, 19)
  assert.equal(presence.totalAgents, 2)
  assert.equal(presence.activeAgents, 1)
  assert.equal(presence.activeSessions, 2)
  assert.equal(presence.skillsDeployed, 2)
  assert.equal(presence.gatewayPort, 18789)
  assert.equal(presence.bindMode, '127.0.0.1')
  assert.equal(presence.authMode, 'token')
})
