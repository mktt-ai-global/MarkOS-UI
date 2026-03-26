import { useState, useEffect, useCallback, useRef } from 'react'
import { openclawClient, type ConnectionStatus, type OpenClawEvent } from '../lib/openclaw-client'

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(openclawClient.getConnectionStatus())
  useEffect(() => openclawClient.onStatus(setStatus), [])
  return status
}

export function useOpenClawEvent(eventName: string, handler: (event: OpenClawEvent) => void) {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    return openclawClient.on(eventName, (e) => handlerRef.current(e))
  }, [eventName])
}

/**
 * Fetch data via RPC with automatic mock fallback when gateway is unavailable.
 * - When connected: calls real RPC method
 * - When disconnected: uses mockData if provided
 * - Supports polling interval for live refresh
 */
export function useGatewayData<T>(
  method: string,
  params: Record<string, unknown> = {},
  mockData: T,
  pollIntervalMs = 0,
): { data: T; loading: boolean; error: string | null; isLive: boolean; refetch: () => void } {
  const [data, setData] = useState<T>(mockData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  const status = useConnectionStatus()
  const paramsKey = stableSerialize(params)
  const requestVersionRef = useRef(0)
  const mockDataRef = useRef(mockData)
  mockDataRef.current = mockData

  const execute = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    const isLatestRequest = () => requestVersion === requestVersionRef.current

    if (status !== 'connected') {
      if (!isLatestRequest()) return
      setError(null)
      setData(mockDataRef.current)
      setIsLive(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const rpcParams = paramsKey ? JSON.parse(paramsKey) as Record<string, unknown> : {}
      const result = await openclawClient.rpc<T>(method, rpcParams)
      if (!isLatestRequest()) return
      setData(result)
      setIsLive(true)
    } catch (e) {
      if (!isLatestRequest()) return
      setError(e instanceof Error ? e.message : 'RPC error')
      setData(mockDataRef.current)
      setIsLive(false)
    } finally {
      if (isLatestRequest()) {
        setLoading(false)
      }
    }
  }, [method, status, paramsKey])

  useEffect(() => {
    execute()
  }, [execute])

  // Optional polling
  useEffect(() => {
    if (pollIntervalMs <= 0 || status !== 'connected') return
    const timer = setInterval(execute, pollIntervalMs)
    return () => clearInterval(timer)
  }, [pollIntervalMs, status, execute])

  return { data, loading, error, isLive, refetch: execute }
}

/**
 * Send an RPC command (write operation). Returns a callable function.
 */
export function useGatewayAction<TParams = Record<string, unknown>, TResult = unknown>() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = useConnectionStatus()

  const execute = useCallback(async (method: string, params?: TParams): Promise<TResult | null> => {
    if (status !== 'connected') {
      setError('Not connected to gateway')
      return null
    }
    setLoading(true)
    setError(null)
    try {
      const result = await openclawClient.rpc<TResult>(method, params as Record<string, unknown>)
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : 'RPC error')
      return null
    } finally {
      setLoading(false)
    }
  }, [status])

  return { execute, loading, error, isConnected: status === 'connected' }
}
