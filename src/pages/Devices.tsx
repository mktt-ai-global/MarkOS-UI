import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Laptop, Search, ShieldCheck, ShieldX, Smartphone, Trash2, X } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { isRecord } from '../lib/utils'
import { useConnectionStatus, useGatewayData } from '../hooks/useOpenClaw'
import { mockDevices, type BrowserDeviceInfo } from '../lib/mock-data'

const trustStyles: Record<BrowserDeviceInfo['trust'], string> = {
  paired: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  revoked: 'bg-danger/10 text-danger',
}

function asString(v: unknown, fb = ''): string {
  return typeof v === 'string' ? v : fb
}

function mapDevice(value: Record<string, unknown>, trust: BrowserDeviceInfo['trust']): BrowserDeviceInfo | null {
  const id = asString(value.deviceId) || asString(value.id)
  if (!id) return null

  const clientId = asString(value.clientId)
  const platform = asString(value.platform, 'browser')
  const deviceFamily = asString(value.deviceFamily)
  const label = clientId || `${deviceFamily} / ${platform}` || id.slice(0, 12)

  const roles = Array.isArray(value.roles) ? value.roles.filter((r): r is string => typeof r === 'string') : []
  const authMode: BrowserDeviceInfo['authMode'] = roles.includes('operator') ? 'device-token' : 'shared-token'

  const approvedAt = typeof value.approvedAtMs === 'number'
    ? new Date(value.approvedAtMs).toLocaleString()
    : asString(value.lastSeen, 'Unknown')

  return { id, label, platform: `${deviceFamily} / ${platform}`, trust, origin: clientId || 'Unknown', lastSeen: approvedAt, authMode }
}

function normalizeDevices(payload: unknown, fallback: BrowserDeviceInfo[]): BrowserDeviceInfo[] {
  // device.pair.list returns { pending: [...], paired: [...] }
  const record = isRecord(payload) ? payload : null
  if (!record) {
    // Legacy array fallback
    if (Array.isArray(payload) && payload.length > 0) return fallback
    return fallback
  }

  const results: BrowserDeviceInfo[] = []
  for (const item of (Array.isArray(record.paired) ? record.paired : [])) {
    if (!isRecord(item)) continue
    const d = mapDevice(item, 'paired')
    if (d) results.push(d)
  }
  for (const item of (Array.isArray(record.pending) ? record.pending : [])) {
    if (!isRecord(item)) continue
    const d = mapDevice(item, 'pending')
    if (d) results.push(d)
  }

  return results.length > 0 ? results : fallback
}

export default function Devices() {
  const [searchQuery, setSearchQuery] = useState('')
  const [uiMessage, setUiMessage] = useState<string | null>(null)
  const dismissRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (dismissRef.current) clearTimeout(dismissRef.current)
    if (!uiMessage) return
    dismissRef.current = setTimeout(() => setUiMessage(null), 4000)
    return () => { if (dismissRef.current) clearTimeout(dismissRef.current) }
  }, [uiMessage])
  const connectionStatus = useConnectionStatus()
  const { data: devicesRaw, isLive } = useGatewayData<unknown>('device.pair.list', {}, mockDevices, 15000)
  const devices = useMemo(() => normalizeDevices(devicesRaw, mockDevices), [devicesRaw])

  const filteredDevices = devices.filter((device) => {
    const haystack = `${device.label} ${device.id} ${device.origin}`.toLowerCase()
    return haystack.includes(searchQuery.toLowerCase())
  })

  const pairedCount = devices.filter((device) => device.trust === 'paired').length
  const pendingCount = devices.filter((device) => device.trust === 'pending').length

  const handlePendingAction = (label: string) => {
    setUiMessage(`${label} is not yet available from the web UI.`)
  }

  return (
    <div className="space-y-3 md:space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Devices</h2>
          <p className="text-xs text-text-tertiary">
            Browser pairing and trusted device management for OpenClaw {isLive ? '(live snapshot)' : '(mock preview)'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-input text-xs flex-1 sm:flex-initial">
          <Search size={14} className="text-text-tertiary" />
          <input
            type="text"
            placeholder="Search devices..."
            className="bg-transparent outline-none text-text-primary placeholder-text-tertiary w-full sm:w-48"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>


      {uiMessage && (
        <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info flex items-start gap-2">
          <span className="flex-1">{uiMessage}</span>
          <button onClick={() => setUiMessage(null)} className="flex-shrink-0 hover:opacity-70 transition-opacity"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        <div className="lg:col-span-4">
          <GlassCard title="Trust Summary" variant="strong">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl glass-subtle p-4">
                <div className="text-2xl font-bold text-text-primary">{pairedCount}</div>
                <div className="text-xs text-text-tertiary mt-1">Paired Devices</div>
              </div>
              <div className="rounded-2xl glass-subtle p-4">
                <div className="text-2xl font-bold text-text-primary">{pendingCount}</div>
                <div className="text-xs text-text-tertiary mt-1">Pending Approval</div>
              </div>
            </div>
            <div className="mt-4 rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
              {connectionStatus === 'connected'
                ? 'Showing live device data from the gateway.'
                : 'You are currently seeing preview data because the gateway is not connected from this browser.'}
            </div>
          </GlassCard>
        </div>

        <div className="lg:col-span-8">
          <GlassCard title="Known Browser Devices" subtitle="Designed around the official pairing / trusted-device flow">
            <div className="space-y-2">
              {filteredDevices.map((device) => (
                <div key={device.id} className="glass-subtle rounded-2xl p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center flex-shrink-0">
                      {device.platform.toLowerCase().includes('ipad') || device.platform.toLowerCase().includes('ios')
                        ? <Smartphone size={18} className="text-accent" />
                        : <Laptop size={18} className="text-accent" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text-primary">{device.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${trustStyles[device.trust]}`}>
                          {device.trust}
                        </span>
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-1 break-all">{device.id}</div>
                      <div className="text-[10px] text-text-tertiary mt-1">
                        {device.platform} · {device.origin} · last seen {device.lastSeen}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap md:justify-end">
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-glass-subtle)] text-text-secondary">
                        {device.authMode}
                      </span>
                      <button
                        onClick={() => handlePendingAction(device.trust === 'pending' ? 'Device approval' : 'Device trust update')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
                      >
                        {device.trust === 'pending' ? <CheckCircle2 size={12} /> : <ShieldCheck size={12} />}
                        {device.trust === 'pending' ? 'Approve' : 'Review'}
                      </button>
                      <button
                        onClick={() => handlePendingAction('Device revocation')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-danger/10 text-danger text-[11px] font-medium hover:bg-danger/20 transition-colors"
                      >
                        {device.trust === 'revoked' ? <ShieldX size={12} /> : <Trash2 size={12} />}
                        {device.trust === 'revoked' ? 'Revoked' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredDevices.length === 0 && (
                <div className="text-center py-8 text-xs text-text-tertiary">
                  No devices match the current search.
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
