export interface BootstrapCredentials {
  gatewayUrl?: string
  token?: string
  hasGatewayUrl: boolean
  hasToken: boolean
}

export type ConnectAuthMode = 'token' | 'device-token' | 'password' | 'none'

export interface ResolvedConnectBootstrap {
  resolvedUrl: string
  password: string
  sharedToken: string
  token: string
  authMode: ConnectAuthMode
  persistSessionToken: {
    shouldPersist: boolean
    value: string
  }
  shouldStripBootstrap: boolean
}

/**
 * Derive the default gateway URL from the current page origin.
 *
 * - When served from localhost / 127.0.0.1 (dev mode):
 *     → connect directly to ws://127.0.0.1:18789 (the local gateway)
 *
 * - When served from a remote domain (production / VPS):
 *     → connect via the nginx reverse proxy at wss://<origin>/ws
 *       so the browser never needs to know the internal gateway port.
 */
function deriveDefaultGatewayUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:18789'

  const { hostname, protocol, host } = window.location
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'

  if (isLocal) {
    return 'ws://127.0.0.1:18789'
  }

  // Remote: use the same origin via nginx /ws proxy
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'
  return `${wsProtocol}//${host}/ws`
}

export const DEFAULT_GATEWAY_URL = deriveDefaultGatewayUrl()

function toHttpUrl(url: string): string {
  return url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
}

function toWsUrl(url: string): string {
  return url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
}

export function normalizeGatewayUrl(url: string, defaultGatewayUrl = DEFAULT_GATEWAY_URL): string {
  const trimmed = url.trim()
  if (!trimmed) return defaultGatewayUrl

  try {
    const parsed = new URL(toHttpUrl(trimmed))
    return toWsUrl(parsed.toString()).replace(/\/$/, '')
  } catch {
    return trimmed
  }
}

export function parseBootstrapCredentials(
  search: string,
  hash: string,
  isTopLevelWindow: boolean,
): BootstrapCredentials {
  const searchParams = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
  const gatewayUrl = isTopLevelWindow
    ? hashParams.get('gatewayUrl')?.trim() || searchParams.get('gatewayUrl')?.trim() || undefined
    : undefined
  const token = hashParams.get('token')?.trim() || searchParams.get('token')?.trim() || undefined

  return {
    gatewayUrl,
    token,
    hasGatewayUrl: Boolean(gatewayUrl),
    hasToken: Boolean(token),
  }
}

export function stripBootstrapCredentialsFromHref(href: string): string {
  const nextUrl = new URL(href)
  nextUrl.searchParams.delete('gatewayUrl')
  nextUrl.searchParams.delete('token')

  const hashParams = new URLSearchParams(nextUrl.hash.replace(/^#/, ''))
  hashParams.delete('gatewayUrl')
  hashParams.delete('token')
  const nextHash = hashParams.toString()
  nextUrl.hash = nextHash ? `#${nextHash}` : ''

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

export function resolveConnectBootstrap(input: {
  explicitGatewayUrl?: string
  explicitAuthToken?: string
  explicitPassword?: string
  bootstrap: BootstrapCredentials
  storedGatewayUrl?: string | null
  sessionToken?: string
  deviceAuthToken?: string
  defaultGatewayUrl?: string
}): ResolvedConnectBootstrap {
  const resolvedUrl = normalizeGatewayUrl(
    input.explicitGatewayUrl ?? input.bootstrap.gatewayUrl ?? input.storedGatewayUrl ?? input.defaultGatewayUrl ?? DEFAULT_GATEWAY_URL,
    input.defaultGatewayUrl ?? DEFAULT_GATEWAY_URL,
  )
  const nextToken = input.explicitAuthToken?.trim()
  const bootstrapToken = input.bootstrap.token || ''
  const sessionToken = input.sessionToken || ''
  const deviceAuthToken = input.deviceAuthToken || ''
  const sharedToken = nextToken || bootstrapToken || sessionToken || ''
  const token = sharedToken || deviceAuthToken || ''
  const password = input.explicitPassword?.trim() || ''
  const authMode: ConnectAuthMode = password
    ? 'password'
    : sharedToken
      ? 'token'
      : token
        ? 'device-token'
        : 'none'

  return {
    resolvedUrl,
    password,
    sharedToken,
    token,
    authMode,
    persistSessionToken: input.explicitAuthToken !== undefined
      ? { shouldPersist: true, value: nextToken || '' }
      : bootstrapToken
        ? { shouldPersist: true, value: bootstrapToken }
        : { shouldPersist: false, value: '' },
    shouldStripBootstrap: input.bootstrap.hasGatewayUrl || input.bootstrap.hasToken,
  }
}
