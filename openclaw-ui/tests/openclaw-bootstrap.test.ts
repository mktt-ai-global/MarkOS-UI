import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_GATEWAY_URL,
  normalizeGatewayUrl,
  parseBootstrapCredentials,
  resolveConnectBootstrap,
  stripBootstrapCredentialsFromHref,
} from '../src/lib/openclaw-bootstrap.ts'

test('normalizeGatewayUrl canonicalizes ws/http variants and falls back when empty', () => {
  assert.equal(normalizeGatewayUrl(' https://example.com/control/ '), 'wss://example.com/control')
  assert.equal(normalizeGatewayUrl('ws://127.0.0.1:18789/'), 'ws://127.0.0.1:18789')
  assert.equal(normalizeGatewayUrl(''), DEFAULT_GATEWAY_URL)
  assert.equal(normalizeGatewayUrl('not a url'), 'not a url')
})

test('parseBootstrapCredentials reads gatewayUrl from hash or query only for top-level windows', () => {
  assert.deepEqual(
    parseBootstrapCredentials('?gatewayUrl=ws://query.local:18789', '#token=abc&gatewayUrl=wss://hash.example.com', true),
    {
      gatewayUrl: 'wss://hash.example.com',
      token: 'abc',
      hasGatewayUrl: true,
      hasToken: true,
    },
  )

  assert.deepEqual(
    parseBootstrapCredentials('?gatewayUrl=ws://query.local:18789&token=query-token', '#gatewayUrl=wss://hash.example.com&token=hash-token', false),
    {
      gatewayUrl: undefined,
      token: 'hash-token',
      hasGatewayUrl: false,
      hasToken: true,
    },
  )
})

test('stripBootstrapCredentialsFromHref removes gatewayUrl and token from both search and hash', () => {
  assert.equal(
    stripBootstrapCredentialsFromHref('https://control.example.com/app?gatewayUrl=ws://query.local:18789&token=query#token=hash&gatewayUrl=wss://hash.example.com&tab=devices'),
    '/app#tab=devices',
  )
})

test('resolveConnectBootstrap applies token precedence and auth-mode selection', () => {
  const resolved = resolveConnectBootstrap({
    explicitGatewayUrl: 'https://remote.example.com/gateway/',
    explicitAuthToken: ' shared-token ',
    explicitPassword: '',
    bootstrap: { gatewayUrl: 'wss://ignored.example.com', token: 'bootstrap-token', hasGatewayUrl: true, hasToken: true },
    storedGatewayUrl: 'ws://127.0.0.1:18789',
    sessionToken: 'session-token',
    deviceAuthToken: 'device-token',
  })

  assert.equal(resolved.resolvedUrl, 'wss://remote.example.com/gateway')
  assert.equal(resolved.sharedToken, 'shared-token')
  assert.equal(resolved.token, 'shared-token')
  assert.equal(resolved.authMode, 'token')
  assert.deepEqual(resolved.persistSessionToken, { shouldPersist: true, value: 'shared-token' })
  assert.equal(resolved.shouldStripBootstrap, true)
})

test('resolveConnectBootstrap falls back to cached device token and password mode when appropriate', () => {
  const deviceTokenResolved = resolveConnectBootstrap({
    explicitPassword: '',
    bootstrap: { hasGatewayUrl: false, hasToken: false },
    storedGatewayUrl: 'ws://127.0.0.1:18789',
    sessionToken: '',
    deviceAuthToken: 'paired-device-token',
  })

  assert.equal(deviceTokenResolved.resolvedUrl, 'ws://127.0.0.1:18789')
  assert.equal(deviceTokenResolved.sharedToken, '')
  assert.equal(deviceTokenResolved.token, 'paired-device-token')
  assert.equal(deviceTokenResolved.authMode, 'device-token')
  assert.deepEqual(deviceTokenResolved.persistSessionToken, { shouldPersist: false, value: '' })

  const passwordResolved = resolveConnectBootstrap({
    explicitPassword: ' secret ',
    bootstrap: { hasGatewayUrl: false, hasToken: false },
    storedGatewayUrl: 'ws://127.0.0.1:18789',
    sessionToken: 'session-token',
    deviceAuthToken: 'paired-device-token',
  })

  assert.equal(passwordResolved.password, 'secret')
  assert.equal(passwordResolved.authMode, 'password')
  assert.equal(passwordResolved.token, 'session-token')
})
