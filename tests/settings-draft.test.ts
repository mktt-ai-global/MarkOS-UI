import assert from 'node:assert/strict'
import test from 'node:test'
import {
  analyzeConfigDraft,
  buildDraftFields,
  buildInitialDraftValues,
  formatConfigValue,
  unwrapPayload,
} from '../src/lib/settings-draft.ts'

const schema = {
  title: 'OpenClaw Config',
  type: 'object',
  properties: {
    gateway: {
      type: 'object',
      properties: {
        port: { type: 'number', description: 'Gateway port' },
        authMode: { type: 'string', enum: ['none', 'token', 'password'] },
        allowedOrigins: { type: 'array', items: { type: 'string' } },
      },
    },
    channels: {
      type: 'object',
      properties: {
        whatsapp: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
          },
        },
      },
    },
  },
}

const config = {
  result: {
    gateway: {
      port: 18789,
      authMode: 'token',
      allowedOrigins: ['http://localhost:5173'],
    },
    channels: {
      whatsapp: {
        enabled: true,
      },
    },
  },
}

test('settings draft field discovery flattens nested config schema', () => {
  const fields = buildDraftFields(schema)

  assert.deepEqual(
    fields.map((field) => ({ path: field.path, kind: field.kind, section: field.section, label: field.label })),
    [
      { path: 'gateway.port', kind: 'number', section: 'Gateway', label: 'Port' },
      { path: 'gateway.authMode', kind: 'enum', section: 'Gateway', label: 'Auth Mode' },
      { path: 'gateway.allowedOrigins', kind: 'string-list', section: 'Gateway', label: 'Allowed Origins' },
      { path: 'channels.whatsapp.enabled', kind: 'boolean', section: 'Channels', label: 'Enabled' },
    ],
  )
})

test('settings draft initial values unwrap payloads and serialize field values', () => {
  const fields = buildDraftFields(schema)
  const initialValues = buildInitialDraftValues(fields, config)

  assert.equal(initialValues['gateway.port'], '18789')
  assert.equal(initialValues['gateway.authMode'], 'token')
  assert.equal(initialValues['gateway.allowedOrigins'], 'http://localhost:5173')
  assert.equal(initialValues['channels.whatsapp.enabled'], true)
  assert.deepEqual(unwrapPayload(config), config.result)
})

test('settings draft analysis builds nested patch payloads and flags invalid fields', () => {
  const fields = buildDraftFields(schema)
  const analysis = analyzeConfigDraft(fields, config, {
    'gateway.port': '19000',
    'gateway.authMode': 'password',
    'gateway.allowedOrigins': 'https://control.example.com\nhttps://ops.example.com',
    'channels.whatsapp.enabled': false,
  })

  assert.equal(analysis.invalidFields.length, 0)
  assert.equal(analysis.changes.length, 4)
  assert.deepEqual(analysis.patch, {
    gateway: {
      port: 19000,
      authMode: 'password',
      allowedOrigins: ['https://control.example.com', 'https://ops.example.com'],
    },
    channels: {
      whatsapp: {
        enabled: false,
      },
    },
  })
})

test('settings draft analysis rejects invalid numbers and leaves unchanged fields out of the patch', () => {
  const fields = buildDraftFields(schema)
  const analysis = analyzeConfigDraft(fields, config, {
    'gateway.port': 'invalid',
    'gateway.authMode': 'token',
    'gateway.allowedOrigins': 'http://localhost:5173',
    'channels.whatsapp.enabled': true,
  })

  assert.deepEqual(analysis.invalidFields.map((field) => field.path), ['gateway.port'])
  assert.equal(analysis.changes.length, 0)
  assert.deepEqual(analysis.patch, {})
  assert.equal(formatConfigValue(undefined), '[unset]')
  assert.equal(formatConfigValue(['a', 'b']), 'a, b')
})
