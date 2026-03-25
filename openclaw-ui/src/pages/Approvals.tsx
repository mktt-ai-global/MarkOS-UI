import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Search, ShieldAlert, XCircle } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { useConnectionStatus, useGatewayData } from '../hooks/useOpenClaw'
import { mockApprovalRequests, type ApprovalRequestInfo } from '../lib/mock-data'

const riskStyles: Record<ApprovalRequestInfo['risk'], string> = {
  low: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-danger/10 text-danger',
}

const statusStyles: Record<ApprovalRequestInfo['status'], string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  denied: 'bg-danger/10 text-danger',
}

function normalizeApprovals(payload: unknown, fallback: ApprovalRequestInfo[]): ApprovalRequestInfo[] {
  if (!Array.isArray(payload)) return fallback

  const nextApprovals = payload
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const value = item as Record<string, unknown>
      const id = typeof value.id === 'string' ? value.id : null
      if (!id) return null

      const risk = value.risk === 'low' || value.risk === 'medium' || value.risk === 'high'
        ? value.risk
        : 'medium'
      const status = value.status === 'pending' || value.status === 'approved' || value.status === 'denied'
        ? value.status
        : 'pending'

      return {
        id,
        agent: typeof value.agent === 'string' ? value.agent : 'Unknown agent',
        scope: typeof value.scope === 'string' ? value.scope : 'unknown.scope',
        summary: typeof value.summary === 'string' ? value.summary : 'No summary provided',
        status,
        requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : 'Unknown',
        requestedBy: typeof value.requestedBy === 'string' ? value.requestedBy : 'Unknown',
        risk,
      } satisfies ApprovalRequestInfo
    })
    .filter((item): item is ApprovalRequestInfo => Boolean(item))

  return nextApprovals.length > 0 ? nextApprovals : fallback
}

export default function Approvals() {
  const [searchQuery, setSearchQuery] = useState('')
  const [uiMessage, setUiMessage] = useState<string | null>(null)
  const connectionStatus = useConnectionStatus()
  const { data: approvalsRaw, isLive } = useGatewayData<unknown>('exec.approvals.list', {}, mockApprovalRequests, 15000)
  const approvals = useMemo(() => normalizeApprovals(approvalsRaw, mockApprovalRequests), [approvalsRaw])

  const filteredApprovals = approvals.filter((approval) => {
    const haystack = `${approval.agent} ${approval.scope} ${approval.summary} ${approval.requestedBy}`.toLowerCase()
    return haystack.includes(searchQuery.toLowerCase())
  })

  const pendingCount = approvals.filter((approval) => approval.status === 'pending').length
  const highRiskCount = approvals.filter((approval) => approval.risk === 'high').length

  const handlePendingAction = (label: string) => {
    setUiMessage(`${label} needs a real OpenClaw gateway before we can safely wire and verify the exact approval RPC behavior.`)
  }

  return (
    <div className="space-y-3 md:space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Approvals</h2>
          <p className="text-xs text-text-tertiary">
            Execution approval queue for privileged OpenClaw actions {isLive ? '(live snapshot)' : '(mock preview)'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass text-xs flex-1 sm:flex-initial">
          <Search size={14} className="text-text-tertiary" />
          <input
            type="text"
            placeholder="Search approvals..."
            className="bg-transparent outline-none text-text-primary placeholder-text-tertiary w-full sm:w-48"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <GlassCard title="Install-Gated TODO" subtitle="These approval flows should wait for a local OpenClaw install">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            'Approve or deny real privileged exec requests',
            'Stream live approval events instead of polling snapshots',
            'Show exact command previews and sandbox context from the gateway',
            'Record approval audit history with actor and timestamp details',
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
          <GlassCard title="Approval Snapshot" variant="strong">
            <div className="space-y-3">
              <div className="rounded-2xl glass-subtle p-4">
                <div className="text-2xl font-bold text-text-primary">{pendingCount}</div>
                <div className="text-xs text-text-tertiary mt-1">Pending Decisions</div>
              </div>
              <div className="rounded-2xl glass-subtle p-4">
                <div className="text-2xl font-bold text-text-primary">{highRiskCount}</div>
                <div className="text-xs text-text-tertiary mt-1">High Risk Requests</div>
              </div>
              <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
                {connectionStatus === 'connected'
                  ? 'The queue is ready to consume live approval data, but decision buttons remain TODO until the gateway RPCs are verified locally.'
                  : 'You are viewing a preview queue because this browser is not connected to a live gateway.'}
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="lg:col-span-8">
          <GlassCard title="Approval Queue" subtitle="Structured for exec approvals and other privileged actions">
            <div className="space-y-2">
              {filteredApprovals.map((approval) => (
                <div key={approval.id} className="glass-subtle rounded-2xl p-4">
                  <div className="flex flex-col md:flex-row gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-warning/20 to-danger/20 flex items-center justify-center flex-shrink-0">
                      {approval.risk === 'high'
                        ? <ShieldAlert size={18} className="text-danger" />
                        : approval.status === 'approved'
                          ? <CheckCircle2 size={18} className="text-success" />
                          : approval.status === 'denied'
                            ? <XCircle size={18} className="text-danger" />
                            : <AlertTriangle size={18} className="text-warning" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-text-primary">{approval.agent}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${riskStyles[approval.risk]}`}>
                          {approval.risk} risk
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusStyles[approval.status]}`}>
                          {approval.status}
                        </span>
                      </div>
                      <div className="text-xs text-text-primary mt-2">{approval.summary}</div>
                      <div className="text-[10px] text-text-tertiary mt-1">
                        {approval.scope} · requested by {approval.requestedBy}
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-1 flex items-center gap-1">
                        <Clock3 size={10} />
                        {approval.requestedAt}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap md:justify-end">
                      <button
                        onClick={() => handlePendingAction('Approval grant')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-success/10 text-success text-[11px] font-medium hover:bg-success/20 transition-colors"
                      >
                        <CheckCircle2 size={12} />
                        Approve
                      </button>
                      <button
                        onClick={() => handlePendingAction('Approval denial')}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-danger/10 text-danger text-[11px] font-medium hover:bg-danger/20 transition-colors"
                      >
                        <XCircle size={12} />
                        Deny
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredApprovals.length === 0 && (
                <div className="text-center py-8 text-xs text-text-tertiary">
                  No approval requests match the current search.
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}
