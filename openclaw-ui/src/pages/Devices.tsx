import { useMemo, useState } from 'react'
import { CheckCircle2, Laptop, Search, ShieldCheck, ShieldX, Smartphone, Trash2 } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { useConnectionStatus, useGatewayData } from '../hooks/useOpenClaw'
import { mockDevices, type BrowserDeviceInfo } from '../lib/mock-data'

const trustStyles: Record<BrowserDeviceInfo['trust'], string> = {
  paired: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  revoked: 'bg-danger/10 text-danger',
}

function normalizeDevices(payload: unknown, fallback: BrowserDeviceInfo[]): BrowserDeviceInfo[] {
  if (!Array.isArray(payload)) return fallback

  const nextDevices = payload
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const value = item as Record<string, unknown>
      const id = typeof value.id === 'string' ? value.id : typeof value.deviceId === 'string' ? value.deviceId : null
      if (!id) return null

      const trustValue = value.trust === 'paired' || value.trust === 'pending' || value.trust === 'revoked'
        ? value.trust
        : 'pending'
      const authMode = value.authMode === 'device-token' || value.authMode === 'shared-token' || value.authMode === 'password'
        ? value.authMode
        : 'shared-token'

      return {
        id,
        label: typeof value.label === 'string' ? value.label : typeof value.name === 'string' ? value.name : id,
        platform: typeof value.platform === 'string' ? value.platform : 'browser',
        trust: trustValue,
        origin: typeof value.origin === 'string' ? value.origin : 'Unknown origin',
        lastSeen: typeof value.lastSeen === 'string' ? value.lastSeen : 'Unknown',
        authMode,
      } satisfies BrowserDeviceInfo
    })
    .filter((item): item is BrowserDeviceInfo => Boolean(item))

  return nextDevices.length > 0 ? nextDevices : fallback
}

export default function Devices() {
  const [searchQuery, setSearchQuery] = useState('')
  const [uiMessage, setUiMessage] = useState<string | null>(null)
  const connectionStatus = useConnectionStatus()
  const { data: devicesRaw, isLive } = useGatewayData<unknown>('devices.list', {}, mockDevices, 15000)
  const devices = useMemo(() => normalizeDevices(devicesRaw, mockDevices), [devicesRaw])

  const filteredDevices = devices.filter((device) => {
    const haystack = `${device.label} ${device.id} ${device.origin}`.toLowerCase()
    return haystack.includes(searchQuery.toLowerCase())
  })

  const pairedCount = devices.filter((device) => device.trust === 'paired').length
  const pendingCount = devices.filter((device) => device.trust === 'pending').length

  const handlePendingAction = (label: string) => {
    setUiMessage(`${label} remains a TODO until this machine has a real OpenClaw gateway installed and we can verify the exact device RPC flow.`)
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
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass text-xs flex-1 sm:flex-initial">
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

      <GlassCard title="Install-Gated TODO" subtitle="These controls need a live OpenClaw runtime before we can safely wire them">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            'Approve pending browser devices',
            'Revoke paired device tokens',
            'Show real device capabilities and trust history',
            'Validate browser signature payloads against gateway pairing',
          ].map((item) => (
            <div key={item} className="rounded-xl px-3 py-2 text-xs bg-warning/10 text-warning">
              TODO: {item}
            </div>
          ))}
        </div>
      </GlassCard>

      {uiMessage && (
        <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
          {uiMessage}
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
                ? 'The page is ready to consume live device data, but approve/revoke actions stay disabled until verified against a real gateway.'
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
