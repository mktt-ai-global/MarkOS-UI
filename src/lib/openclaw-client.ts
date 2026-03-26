/**
 * OpenClaw Gateway WebSocket Client
 * Connects to the OpenClaw gateway via WebSocket protocol v3.
 * Default endpoint: ws://127.0.0.1:18789
 */

import {
  DEFAULT_GATEWAY_URL,
  normalizeGatewayUrl,
  parseBootstrapCredentials,
  resolveConnectBootstrap,
  stripBootstrapCredentialsFromHref,
} from './openclaw-bootstrap.ts'
import { isRecord } from './utils.ts'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface OpenClawEvent {
  type: 'event'
  event: string
  payload: Record<string, unknown>
  seq?: number
  stateVersion?: number
}

export interface OpenClawResponse {
  type: 'res'
  id: string
  ok: boolean
  payload?: Record<string, unknown>
  error?: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

type EventHandler = (event: OpenClawEvent) => void
type StatusHandler = (status: ConnectionStatus) => void

interface DeviceIdentityRecord {
  id: string
  publicKey: string
  privateKey: CryptoKey
}

interface StoredDeviceIdentityRecord {
  id: string
  publicKey: string
}

interface StoredDeviceKeyRecord {
  slot: 'current'
  deviceId: string
  publicKey: string
  privateKey: CryptoKey
}

export interface GatewayErrorDetails {
  code?: string
  message?: string
  details?: Record<string, unknown>
}

const GATEWAY_URL_KEY = 'openclaw_gateway_url'
const GATEWAY_TOKEN_SESSION_PREFIX = 'openclaw_gateway_token'
const DEVICE_AUTH_TOKEN_PREFIX = 'openclaw_device_auth_token'
const DEVICE_ID_KEY = 'openclaw_device_id'
const DEVICE_IDENTITY_KEY = 'openclaw_device_identity_v1'
const DEVICE_PRIVATE_KEY_SESSION_KEY = 'openclaw_device_private_key_v1'
const DEVICE_KEY_DB_NAME = 'openclaw_ui_device_identity'
const DEVICE_KEY_STORE = 'device_identity'
const CLIENT_INSTANCE_ID_KEY = 'openclaw_client_instance_id'

/**
 * Migrate stale localStorage: if the page is served from a remote domain
 * but the stored gateway URL still points to localhost (from a previous
 * direct-access session), clear it so the auto-detected URL takes effect.
 */
function migrateStaleGatewayUrl() {
  if (typeof window === 'undefined') return
  const { hostname } = window.location
  const isRemote = hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]'
  if (!isRemote) return

  const stored = localStorage.getItem(GATEWAY_URL_KEY)
  if (stored && /^wss?:\/\/(127\.0\.0\.1|localhost)(:|$)/i.test(stored)) {
    localStorage.removeItem(GATEWAY_URL_KEY)
  }
}
migrateStaleGatewayUrl()

let reqCounter = 0
function nextId(): string {
  return `req_${++reqCounter}_${Date.now()}`
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(view.byteLength)
  new Uint8Array(buffer).set(view)
  return buffer
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof value === 'object' && value !== null && 'type' in value && 'algorithm' in value
}

class OpenClawClient {
  private ws: WebSocket | null = null
  private url: string = ''
  private token: string = ''
  private sharedToken: string = ''
  private password: string = ''
  private status: ConnectionStatus = 'disconnected'
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private statusHandlers = new Set<StatusHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private deviceId: string = ''
  private lastError: string | null = null
  private lastErrorDetails: GatewayErrorDetails | null = null
  private clientInstanceId: string = ''
  private connectRequestId: string | null = null
  private authModeForCurrentConnect: 'token' | 'device-token' | 'password' | 'none' = 'none'
  private trustedDeviceRetryUsed = false
  private deviceIdentityResetUsed = false

  constructor() {
    this.deviceId = this.getOrCreateDeviceId()
    this.clientInstanceId = this.getOrCreateClientInstanceId()
  }

  private getOrCreateDeviceId(): string {
    try {
      let id = localStorage.getItem(DEVICE_ID_KEY)
      if (!id) {
        id = `web-${crypto.randomUUID()}`
        localStorage.setItem(DEVICE_ID_KEY, id)
      }
      return id
    } catch {
      return `web-${crypto.randomUUID()}`
    }
  }

  private getOrCreateClientInstanceId(): string {
    try {
      let id = sessionStorage.getItem(CLIENT_INSTANCE_ID_KEY)
      if (!id) {
        id = crypto.randomUUID()
        sessionStorage.setItem(CLIENT_INSTANCE_ID_KEY, id)
      }
      return id
    } catch {
      return crypto.randomUUID()
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return this.status
  }

  getLastError(): string | null {
    return this.lastError
  }

  getLastErrorDetails(): GatewayErrorDetails | null {
    return this.lastErrorDetails
  }

  getDeviceId(): string {
    return this.deviceId
  }

  getSavedGatewayUrl(): string {
    const bootstrap = this.readBootstrapCredentials()
    return normalizeGatewayUrl(bootstrap.gatewayUrl || localStorage.getItem(GATEWAY_URL_KEY) || DEFAULT_GATEWAY_URL)
  }

  getSessionGatewayToken(gatewayUrl = this.getSavedGatewayUrl()): string {
    return sessionStorage.getItem(this.getSessionTokenKey(gatewayUrl)) || ''
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s
    this.statusHandlers.forEach(h => h(s))
  }

  private setLastError(message: string | null) {
    this.lastError = message
  }

  private setLastErrorDetails(details: GatewayErrorDetails | null) {
    this.lastErrorDetails = details
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
    return () => this.eventHandlers.get(event)?.delete(handler)
  }

  private readBootstrapCredentials(): { gatewayUrl?: string; token?: string; hasGatewayUrl: boolean; hasToken: boolean } {
    return parseBootstrapCredentials(window.location.search, window.location.hash, window.top === window.self)
  }

  private stripBootstrapCredentials() {
    history.replaceState(null, '', stripBootstrapCredentialsFromHref(window.location.href))
  }

  private getSessionTokenKey(gatewayUrl: string): string {
    return `${GATEWAY_TOKEN_SESSION_PREFIX}:${normalizeGatewayUrl(gatewayUrl)}`
  }

  private getDeviceAuthTokenKey(gatewayUrl: string): string {
    return `${DEVICE_AUTH_TOKEN_PREFIX}:${normalizeGatewayUrl(gatewayUrl)}`
  }

  private getStoredDeviceAuthToken(gatewayUrl: string): string {
    return localStorage.getItem(this.getDeviceAuthTokenKey(gatewayUrl)) || ''
  }

  private openDeviceKeyDatabase(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null)
    }

    return new Promise((resolve) => {
      const request = indexedDB.open(DEVICE_KEY_DB_NAME, 1)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(DEVICE_KEY_STORE)) {
          database.createObjectStore(DEVICE_KEY_STORE, { keyPath: 'slot' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    })
  }

  private async readStoredDeviceKeyRecord(): Promise<StoredDeviceKeyRecord | null> {
    const database = await this.openDeviceKeyDatabase()
    if (!database) return null

    return new Promise((resolve) => {
      const transaction = database.transaction(DEVICE_KEY_STORE, 'readonly')
      const store = transaction.objectStore(DEVICE_KEY_STORE)
      const request = store.get('current')

      request.onsuccess = () => {
        const value = request.result
        database.close()

        if (
          isRecord(value) &&
          value.slot === 'current' &&
          typeof value.deviceId === 'string' &&
          typeof value.publicKey === 'string' &&
          isCryptoKey(value.privateKey)
        ) {
          resolve({
            slot: 'current',
            deviceId: value.deviceId,
            publicKey: value.publicKey,
            privateKey: value.privateKey,
          })
          return
        }

        resolve(null)
      }

      request.onerror = () => {
        database.close()
        resolve(null)
      }
    })
  }

  private async persistStoredDeviceKeyRecord(record: StoredDeviceKeyRecord): Promise<boolean> {
    const database = await this.openDeviceKeyDatabase()
    if (!database) return false

    return new Promise((resolve) => {
      const transaction = database.transaction(DEVICE_KEY_STORE, 'readwrite')
      const store = transaction.objectStore(DEVICE_KEY_STORE)
      store.put(record)

      transaction.oncomplete = () => {
        database.close()
        resolve(true)
      }

      transaction.onerror = () => {
        database.close()
        resolve(false)
      }
    })
  }

  private async clearStoredDeviceKeyRecord(): Promise<void> {
    const database = await this.openDeviceKeyDatabase()
    if (!database) return

    await new Promise<void>((resolve) => {
      const transaction = database.transaction(DEVICE_KEY_STORE, 'readwrite')
      const store = transaction.objectStore(DEVICE_KEY_STORE)
      store.delete('current')

      transaction.oncomplete = () => {
        database.close()
        resolve()
      }

      transaction.onerror = () => {
        database.close()
        resolve()
      }
    })
  }

  private async importLegacyPrivateKey(privateKey: string): Promise<CryptoKey | null> {
    try {
      return await crypto.subtle.importKey(
        'pkcs8',
        toArrayBuffer(base64UrlToUint8Array(privateKey)),
        { name: 'Ed25519' },
        false,
        ['sign'],
      )
    } catch {
      return null
    }
  }

  private persistDeviceIdentityMetadata(identity: StoredDeviceIdentityRecord) {
    localStorage.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(identity))
    localStorage.setItem(DEVICE_ID_KEY, identity.id)
    this.deviceId = identity.id
  }

  private persistSessionDevicePrivateKey(privateKey: string) {
    if (privateKey) {
      sessionStorage.setItem(DEVICE_PRIVATE_KEY_SESSION_KEY, privateKey)
    } else {
      sessionStorage.removeItem(DEVICE_PRIVATE_KEY_SESSION_KEY)
    }
  }

  private clearStoredDeviceAuthTokens() {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(`${DEVICE_AUTH_TOKEN_PREFIX}:`))
      .forEach((key) => localStorage.removeItem(key))
  }

  private persistSessionGatewayToken(gatewayUrl: string, token: string) {
    const key = this.getSessionTokenKey(gatewayUrl)
    if (token) {
      sessionStorage.setItem(key, token)
    } else {
      sessionStorage.removeItem(key)
    }
  }

  private persistDeviceAuthToken(gatewayUrl: string, token: string) {
    const key = this.getDeviceAuthTokenKey(gatewayUrl)
    if (token) {
      localStorage.setItem(key, token)
    } else {
      localStorage.removeItem(key)
    }
  }

  private findDeviceAuthToken(payload: unknown): string | null {
    if (!isRecord(payload)) return null

    const auth = isRecord(payload.auth) ? payload.auth : null
    const helloOk = isRecord(payload['hello-ok']) ? payload['hello-ok'] : null
    const helloOkAuth = helloOk && isRecord(helloOk.auth) ? helloOk.auth : null
    const directToken = typeof payload.deviceToken === 'string' ? payload.deviceToken : null
    const authToken = auth && typeof auth.deviceToken === 'string' ? auth.deviceToken : null
    const helloToken = helloOkAuth && typeof helloOkAuth.deviceToken === 'string' ? helloOkAuth.deviceToken : null

    return directToken || authToken || helloToken
  }

  connect(gatewayUrl?: string, authToken?: string, authPassword?: string) {
    const bootstrap = this.readBootstrapCredentials()
    const storedUrl = localStorage.getItem(GATEWAY_URL_KEY)
    const preResolvedUrl = normalizeGatewayUrl(gatewayUrl ?? bootstrap.gatewayUrl ?? storedUrl ?? DEFAULT_GATEWAY_URL)
    const resolved = resolveConnectBootstrap({
      explicitGatewayUrl: gatewayUrl,
      explicitAuthToken: authToken,
      explicitPassword: authPassword,
      bootstrap,
      storedGatewayUrl: storedUrl,
      sessionToken: this.getSessionGatewayToken(preResolvedUrl),
      deviceAuthToken: this.getStoredDeviceAuthToken(preResolvedUrl),
      defaultGatewayUrl: DEFAULT_GATEWAY_URL,
    })

    this.url = resolved.resolvedUrl
    this.password = resolved.password
    this.sharedToken = resolved.sharedToken
    this.token = resolved.token
    this.authModeForCurrentConnect = resolved.authMode
    this.trustedDeviceRetryUsed = false
    this.deviceIdentityResetUsed = false
    this.setLastError(null)
    this.setLastErrorDetails(null)

    if (this.url) {
      localStorage.setItem(GATEWAY_URL_KEY, this.url)
    } else {
      localStorage.removeItem(GATEWAY_URL_KEY)
    }

    if (resolved.persistSessionToken.shouldPersist) {
      this.persistSessionGatewayToken(this.url, resolved.persistSessionToken.value)
    }

    if (resolved.shouldStripBootstrap) {
      this.stripBootstrapCredentials()
    }

    this.doConnect()
  }

  private doConnect() {
    if (this.ws) {
      this.rejectPendingRequests(new Error('Connection restarted'))
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }

    this.setStatus('connecting')
    this.setLastErrorDetails(null)

    const wsUrl = this.url.replace(/^http/, 'ws')
    try {
      this.ws = new WebSocket(wsUrl)
    } catch {
      this.setLastError('Unable to open a WebSocket connection to the configured gateway URL.')
      this.setStatus('error')
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      // Wait for connect.challenge event
    }

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'event') {
          if (msg.event === 'connect.challenge') {
            this.handleChallenge(msg.payload)
          } else {
            this.dispatchEvent(msg)
          }
        } else if (msg.type === 'res') {
          this.handleResponse(msg)
        }
      } catch {
        // ignore parse errors
      }
    }

    this.ws.onclose = (event) => {
      this.ws = null
      if (event.reason) {
        this.setLastError(event.reason)
      } else if (event.code && event.code !== 1000) {
        this.setLastError(`Gateway closed the connection (${event.code}).`)
      }
      this.rejectPendingRequests(new Error('Connection closed'))
      this.setStatus('disconnected')
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      if (!this.lastError) {
        this.setLastError('WebSocket connection error')
      }
      this.rejectPendingRequests(new Error('WebSocket connection error'))
      this.setStatus('error')
    }
  }

  private async getOrCreateDeviceIdentity(): Promise<DeviceIdentityRecord> {
    const stored = localStorage.getItem(DEVICE_IDENTITY_KEY)
    const sessionPrivateKey = sessionStorage.getItem(DEVICE_PRIVATE_KEY_SESSION_KEY)
    const storedKeyRecord = await this.readStoredDeviceKeyRecord()

    if (storedKeyRecord) {
      this.persistDeviceIdentityMetadata({
        id: storedKeyRecord.deviceId,
        publicKey: storedKeyRecord.publicKey,
      })
      if (sessionPrivateKey) {
        sessionStorage.removeItem(DEVICE_PRIVATE_KEY_SESSION_KEY)
      }

      return {
        id: storedKeyRecord.deviceId,
        publicKey: storedKeyRecord.publicKey,
        privateKey: storedKeyRecord.privateKey,
      }
    }

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<DeviceIdentityRecord & StoredDeviceIdentityRecord>
        const legacyPrivateKey = typeof parsed.privateKey === 'string' ? parsed.privateKey : ''
        const privateKey = sessionPrivateKey || legacyPrivateKey

        if (parsed.id && parsed.publicKey && privateKey) {
          const importedPrivateKey = await this.importLegacyPrivateKey(privateKey)
          if (importedPrivateKey) {
            const didPersist = await this.persistStoredDeviceKeyRecord({
              slot: 'current',
              deviceId: parsed.id,
              publicKey: parsed.publicKey,
              privateKey: importedPrivateKey,
            })

            if (didPersist) {
              this.persistSessionDevicePrivateKey('')
            } else {
              this.persistSessionDevicePrivateKey(privateKey)
            }

            this.persistDeviceIdentityMetadata({
              id: parsed.id,
              publicKey: parsed.publicKey,
            })

            return {
              id: parsed.id,
              publicKey: parsed.publicKey,
              privateKey: importedPrivateKey,
            }
          }
        }
      } catch {
        // fall through and regenerate
      }
    }

    await this.clearStoredDeviceKeyRecord()

    const keyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    )
    const publicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    const exportedPrivateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      exportedPrivateKey,
      { name: 'Ed25519' },
      false,
      ['sign'],
    )
    const exportedPrivateKeyBase64 = bufferToBase64Url(exportedPrivateKey)
    const identity: DeviceIdentityRecord = {
      id: await sha256Hex(publicKey),
      publicKey: bufferToBase64Url(publicKey),
      privateKey,
    }

    this.persistDeviceIdentityMetadata({
      id: identity.id,
      publicKey: identity.publicKey,
    })
    const didPersist = await this.persistStoredDeviceKeyRecord({
      slot: 'current',
      deviceId: identity.id,
      publicKey: identity.publicKey,
      privateKey: identity.privateKey,
    })
    this.persistSessionDevicePrivateKey(didPersist ? '' : exportedPrivateKeyBase64)
    this.clearStoredDeviceAuthTokens()
    return identity
  }

  private getDeviceFamily(): string {
    return 'browser'
  }

  private getClientPlatform(): string {
    return 'web'
  }

  private getSigningCredential(): string {
    if (this.authModeForCurrentConnect === 'device-token') {
      return this.getStoredDeviceAuthToken(this.url)
    }
    if (this.authModeForCurrentConnect === 'token') {
      return this.sharedToken
    }
    return ''
  }

  private async buildSignedDevice(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const identity = await this.getOrCreateDeviceIdentity()
    const nonce = typeof payload.nonce === 'string' ? payload.nonce : ''
    const signedAt = typeof payload.ts === 'number' ? payload.ts : Date.now()
    const signingToken = this.getSigningCredential()
    const signaturePayload = [
      'v2',
      identity.id,
      'openclaw-control-ui',
      'webchat',
      'operator',
      'operator.read,operator.write,operator.admin,operator.pairing,operator.approvals',
      `${signedAt}`,
      signingToken,
      nonce,
    ].join('|')

    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' },
      identity.privateKey,
      new TextEncoder().encode(signaturePayload),
    )

    return {
      id: identity.id,
      publicKey: identity.publicKey,
      signature: bufferToBase64Url(signature),
      signedAt,
      nonce,
    }
  }

  private handleChallenge(payload: Record<string, unknown>) {
    void this.completeChallenge(payload)
  }

  private async completeChallenge(payload: Record<string, unknown>) {
    let device: Record<string, unknown> | undefined

    try {
      device = await this.buildSignedDevice(payload)
    } catch {
      this.setLastError(window.isSecureContext
        ? 'Failed to create browser device identity for gateway pairing.'
        : 'This browser context cannot use WebCrypto device identity. Use HTTPS or connect via localhost.')
    }

    const connectReq = {
      type: 'req',
      id: nextId(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-control-ui',
          version: '1.0.0',
          platform: this.getClientPlatform(),
          deviceFamily: this.getDeviceFamily(),
          mode: 'webchat',
          instanceId: this.clientInstanceId,
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin', 'operator.pairing', 'operator.approvals'],
        caps: ['agent-events', 'tool-events'],
        locale: navigator.language || 'en-US',
        userAgent: navigator.userAgent,
        device: {
          id: this.deviceId,
          nonce: payload.nonce,
          ...device,
        },
        auth: this.password
          ? { password: this.password }
          : this.token
            ? { token: this.token }
            : undefined,
      },
    }

    this.connectRequestId = connectReq.id
    this.ws?.send(JSON.stringify(connectReq))

    // Store pending for the connect response
    this.pendingRequests.set(connectReq.id, {
      resolve: (responsePayload) => {
        const deviceAuthToken = this.findDeviceAuthToken(responsePayload)
        if (deviceAuthToken) {
          this.persistDeviceAuthToken(this.url, deviceAuthToken)
        }
        this.setLastError(null)
        this.setStatus('connected')
      },
      reject: (error) => {
        this.setLastError(error.message)
        this.setStatus('error')
      },
    })
  }

  private canRetryWithDeviceToken(details: Record<string, unknown> | undefined): boolean {
    return Boolean(
      details &&
      details.canRetryWithDeviceToken === true &&
      !this.trustedDeviceRetryUsed &&
      this.authModeForCurrentConnect === 'token' &&
      this.getStoredDeviceAuthToken(this.url),
    )
  }

  private trustedRetryWithDeviceToken() {
    this.trustedDeviceRetryUsed = true
    this.token = this.getStoredDeviceAuthToken(this.url)
    this.authModeForCurrentConnect = this.token ? 'device-token' : 'none'
    this.doConnect()
  }

  private canRetryWithFreshIdentity(error: OpenClawResponse['error']): boolean {
    if (this.deviceIdentityResetUsed) return false
    const code = (error?.code || '').toUpperCase()
    const message = (error?.message || '').toLowerCase()
    return code.includes('SIGNATURE') || code.includes('DEVICE_SIG') ||
      message.includes('signature invalid') || message.includes('device signature')
  }

  private async resetDeviceIdentityAndRetry() {
    this.deviceIdentityResetUsed = true
    // Clear all stored device identity artifacts
    await this.clearStoredDeviceKeyRecord()
    localStorage.removeItem(DEVICE_IDENTITY_KEY)
    sessionStorage.removeItem(DEVICE_PRIVATE_KEY_SESSION_KEY)
    this.clearStoredDeviceAuthTokens()
    // Regenerate device ID
    const newId = `web-${crypto.randomUUID()}`
    localStorage.setItem(DEVICE_ID_KEY, newId)
    this.deviceId = newId
    // Reconnect — getOrCreateDeviceIdentity will generate a fresh key pair
    this.doConnect()
  }

  private handleResponse(msg: OpenClawResponse) {
    const pending = this.pendingRequests.get(msg.id)
    if (pending) {
      this.pendingRequests.delete(msg.id)
      if (msg.ok) {
        if (msg.id === this.connectRequestId) {
          this.connectRequestId = null
        }
        pending.resolve(msg.payload || {})
      } else {
        const errorDetails = {
          code: msg.error?.code,
          message: msg.error?.message,
          details: msg.error?.details,
        }
        this.setLastErrorDetails(errorDetails)

        if (msg.id === this.connectRequestId && this.canRetryWithDeviceToken(msg.error?.details)) {
          this.connectRequestId = null
          this.trustedRetryWithDeviceToken()
          return
        }

        // Auto-recover from stale device identity (e.g. client ID changed
        // between versions).  Clear the stored key pair and retry once.
        if (msg.id === this.connectRequestId && this.canRetryWithFreshIdentity(msg.error)) {
          this.connectRequestId = null
          void this.resetDeviceIdentityAndRetry()
          return
        }

        const error = new Error(msg.error?.message || 'Unknown error')
        this.setLastError(error.message)
        pending.reject(error)
      }
    }
  }

  private dispatchEvent(msg: OpenClawEvent) {
    const handlers = this.eventHandlers.get(msg.event)
    handlers?.forEach(h => h(msg))
    // Also dispatch to wildcard listeners
    const wildcardHandlers = this.eventHandlers.get('*')
    wildcardHandlers?.forEach(h => h(msg))
  }

  private rejectPendingRequests(error: Error) {
    if (this.pendingRequests.size === 0) return

    this.pendingRequests.forEach(({ reject }) => reject(error))
    this.pendingRequests.clear()
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.status !== 'connected') {
        this.doConnect()
      }
    }, 3000)
  }

  async rpc<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to OpenClaw gateway')
    }

    const id = nextId()
    const msg = { type: 'req', id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`RPC timeout: ${method}`))
      }, 30000)

      this.pendingRequests.set(id, {
        resolve: (v) => {
          clearTimeout(timeout)
          resolve(v as T)
        },
        reject: (e) => {
          clearTimeout(timeout)
          reject(e)
        },
      })

      this.ws!.send(JSON.stringify(msg))
    })
  }

  // Convenience methods — verified against OpenClaw 2026.3.23-2
  async getGatewayStatus() { return this.rpc('status') }
  async getHealth() { return this.rpc('health') }
  async getChatHistory(sessionKey: string) { return this.rpc('chat.history', { sessionKey }) }
  async sendChat(text: string, sessionKey: string) { return this.rpc('chat.send', { text, sessionKey }) }
  async abortChat(sessionKey: string) { return this.rpc('chat.abort', { sessionKey }) }
  async getConfig() { return this.rpc('config.get') }
  async setConfig(key: string, value: unknown) { return this.rpc('config.set', { key, value }) }
  async applyConfig(patch: Record<string, unknown>) { return this.rpc('config.apply', { patch }) }
  async getConfigSchema() { return this.rpc('config.schema') }
  async listSessions() { return this.rpc('sessions.list') }
  async listModels() { return this.rpc('models.list') }
  async listNodes() { return this.rpc('node.list') }
  async listAgents() { return this.rpc('agents.list') }
  async getChannelsStatus() { return this.rpc('channels.status') }
  async getToolsCatalog() { return this.rpc('tools.catalog') }
  async getPresence() { return this.rpc('system-presence') }
  async tailLogs(cursor?: string) { return this.rpc('logs.tail', cursor ? { cursor } : {}) }
  async listCron() { return this.rpc('cron.list') }
  async listDevices() { return this.rpc('device.pair.list') }
  async getExecApprovals() { return this.rpc('exec.approvals.get') }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.password = ''
    this.setLastError(null)
    this.setLastErrorDetails(null)
    this.setStatus('disconnected')
  }
}

// Singleton
export const openclawClient = new OpenClawClient()
