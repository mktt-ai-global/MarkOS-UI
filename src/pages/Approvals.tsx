import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Search, ShieldAlert, X, XCircle } from 'lucide-react'
import GlassCard from '../components/GlassCard'
import { isRecord } from '../lib/utils'
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
  // exec.approvals.get returns { file: { agents: { <agentId>: { ... } }, defaults: { ... } } }
  const record = isRecord(payload) ? payload : null
  const file = isRecord(record?.file) ? record.file : isRecord(payload) ? payload : null
  if (!file) return fallback

  const agents = isRecord(file.agents) ? file.agents : {}
  const defaults = isRecord(file.defaults) ? file.defaults : {}

  const results: ApprovalRequestInfo[] = []

  // Map agent-level approval rules
  for (const [agentId, agentRules] of Object.entries(agents)) {
    if (!isRecord(agentRules)) continue
    for (const [scope, rule] of Object.entries(agentRules)) {
      const ruleValue = typeof rule === 'string' ? rule : isRecord(rule) ? String(rule.action || rule.policy || 'unknown') : String(rule)
      const status: ApprovalRequestInfo['status'] =
        ruleValue === 'allow' || ruleValue === 'approved' ? 'approved'
        : ruleValue === 'deny' || ruleValue === 'denied' ? 'denied'
        : 'pending'
      results.push({
        id: `${agentId}:${scope}`,
        agent: agentId,
        scope,
        summary: `Policy: ${ruleValue}`,
        status,
        requestedAt: '',
        requestedBy: agentId,
        risk: scope.includes('exec') || scope.includes('shell') ? 'high' : scope.includes('write') ? 'medium' : 'low',
      })
    }
  }

  // Map default rules
  for (const [scope, rule] of Object.entries(defaults)) {
    const ruleValue = typeof rule === 'string' ? rule : String(rule)
    results.push({
      id: `defaults:${scope}`,
      agent: '(defaults)',
      scope,
      summary: `Default policy: ${ruleValue}`,
      status: 'approved',
      requestedAt: '',
      requestedBy: 'system',
      risk: 'low',
    })
  }

  // If no rules exist, return an empty state (not fallback mock data)
  return results
}

export default function Approvals() {
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
  const { data: approvalsRaw, isLive } = useGatewayData<unknown>('exec.approvals.get', {}, mockApprovalRequests, 15000)
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
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-input text-xs flex-1 sm:flex-initial">
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


      {uiMessage && (
        <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info flex items-start gap-2">
          <span className="flex-1">{uiMessage}</span>
          <button onClick={() => setUiMessage(null)} className="flex-shrink-0 hover:opacity-70 transition-opacity"><X size={14} /></button>
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
                  ? 'Showing live approval data from the gateway.'
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
