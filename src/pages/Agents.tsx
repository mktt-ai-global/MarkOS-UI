import { useEffect, useState } from 'react'
import {
  Bot,
  Check,
  PencilLine,
  Plus,
  Search,
  Play,
  Pause,
  Settings2,
  BarChart3,
  Clock,
  Cpu,
  Zap,
  ChevronRight,
  Trash2,
  X,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import TemplateStudio from '../components/TemplateStudio'
import { buildAgentPerformanceSeries, normalizeAgents, normalizeSessions } from '../lib/openclaw-adapters'
import { useGatewayData } from '../hooks/useOpenClaw'
import { mockAgents, mockSessions, type AgentInfo } from '../lib/mock-data'
import {
  loadAgentDrafts,
  loadSkillDrafts,
  persistAgentDrafts,
  renameAgentDraftEntry,
  stampAgentDraft,
  subscribeAgentDrafts,
  subscribeSkillDrafts,
  type LocalAgentDraft,
  type LocalSkillDraft,
} from '../lib/draft-storage'
import type { AgentTemplateForm } from '../lib/template-studio'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'

const statusStyles: Record<string, string> = {
  active: 'bg-success/10 text-success',
  idle: 'bg-warning/10 text-warning',
  stopped: 'bg-text-tertiary/10 text-text-tertiary',
}

const statusDot: Record<string, string> = {
  active: 'bg-success',
  idle: 'bg-warning',
  stopped: 'bg-text-tertiary',
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function Agents() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [showCreator, setShowCreator] = useState(false)
  const [editorSeed, setEditorSeed] = useState(0)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [localDraftAgents, setLocalDraftAgents] = useState<LocalAgentDraft[]>(() => loadAgentDrafts())
  const [localSkillDrafts, setLocalSkillDrafts] = useState<LocalSkillDraft[]>(() => loadSkillDrafts())
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const { data: sessionsRaw, isLive: sessionsLive } = useGatewayData<unknown>('sessions.list', {}, mockSessions, 10000)
  const { data: agentsListRaw, isLive: agentsLive } = useGatewayData<unknown>('agents.list', {}, { agents: mockAgents }, 15000)
  const sessions = normalizeSessions(sessionsRaw, mockSessions)
  const liveAgents = normalizeAgents(agentsListRaw, sessions, mockAgents)
  const localDraftPreviews = localDraftAgents.map((draft) => draft.preview)
  const agents = [...localDraftPreviews, ...liveAgents.filter((agent) => !localDraftPreviews.some((draft) => draft.id === agent.id))]
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId) || null
  const selectedDraft = localDraftAgents.find((draft) => draft.preview.id === selectedAgentId) || null
  const editingDraft = localDraftAgents.find((draft) => draft.preview.id === editingDraftId) || null
  const selectedDraftSkillIds = selectedDraft ? splitLines(selectedDraft.form.allowedSkills) : []
  const linkedSkillDrafts = selectedDraftSkillIds
    .map((skillId) => localSkillDrafts.find((draft) => draft.preview.id === skillId))
    .filter((draft): draft is LocalSkillDraft => Boolean(draft))
  const missingSkillLinks = selectedDraftSkillIds.filter((skillId) => !linkedSkillDrafts.some((draft) => draft.preview.id === skillId))

  const filtered = agents.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.id.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const isLive = sessionsLive || agentsLive
  const perfData = selectedAgent ? buildAgentPerformanceSeries(selectedAgent.id, selectedAgent.sessions) : buildAgentPerformanceSeries('agent', 2)

  const handlePendingAction = (label: string) => {
    setActionMessage(`${label} is not yet available from the web UI.`)
  }

  useEffect(() => {
    persistAgentDrafts(localDraftAgents)
  }, [localDraftAgents])

  useEffect(() => subscribeAgentDrafts(() => {
    setLocalDraftAgents(loadAgentDrafts())
  }), [])

  useEffect(() => subscribeSkillDrafts(() => {
    setLocalSkillDrafts(loadSkillDrafts())
  }), [])

  const openStudioForCreate = () => {
    setEditingDraftId(null)
    setRenamingDraftId(null)
    setEditorSeed((current) => current + 1)
    setShowCreator(true)
    setActionMessage(null)
  }

  const openStudioForEdit = (draftId: string) => {
    setEditingDraftId(draftId)
    setRenamingDraftId(null)
    setEditorSeed((current) => current + 1)
    setShowCreator(true)
    setActionMessage(`Editing local template "${draftId}". Runtime install is still pending live gateway support.`)
  }

  const handleCreateLocalDraft = (draft: AgentInfo, form: AgentTemplateForm) => {
    setLocalDraftAgents((current) => {
      const next = current.filter((item) => item.preview.id !== draft.id)
      return [stampAgentDraft(draft, form), ...next]
    })
    setSelectedAgentId(draft.id)
    setEditingDraftId(draft.id)
    setShowCreator(true)
    setActionMessage(`Saved local template "${draft.name}".`)
  }

  const startRenameDraft = (draft: LocalAgentDraft) => {
    setRenamingDraftId(draft.preview.id)
    setRenameValue(draft.preview.name)
  }

  const cancelRenameDraft = () => {
    setRenamingDraftId(null)
    setRenameValue('')
  }

  const commitRenameDraft = (draftId: string) => {
    const nextName = renameValue.trim()
    if (!nextName) return

    setLocalDraftAgents((current) => current.map((draft) => (
      draft.preview.id === draftId
        ? renameAgentDraftEntry(draft, nextName)
        : draft
    )))
    setRenamingDraftId(null)
    setRenameValue('')
    setActionMessage(`Renamed local template to "${nextName}".`)
  }

  const deleteDraft = (draftId: string) => {
    setLocalDraftAgents((current) => current.filter((draft) => draft.preview.id !== draftId))
    if (selectedAgentId === draftId) {
      setSelectedAgentId(null)
    }
    if (editingDraftId === draftId) {
      setEditingDraftId(null)
      setShowCreator(false)
    }
    if (renamingDraftId === draftId) {
      cancelRenameDraft()
    }
    setActionMessage(`Removed local template "${draftId}".`)
  }

  return (
    <div className="space-y-3 md:space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Agents</h2>
          <p className="text-xs text-text-tertiary">{agents.length} agents visible, {agents.filter(a => a.status === 'active').length} active {isLive ? '(live)' : '(mock)'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-input text-xs flex-1 sm:flex-initial">
            <Search size={14} className="text-text-tertiary" />
            <input
              type="text"
              placeholder="Search agents..."
              className="bg-transparent outline-none text-text-primary placeholder-text-tertiary w-full sm:w-40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
            className="w-9 h-9 rounded-xl glass flex items-center justify-center text-text-secondary hover:text-accent transition-colors"
          >
            <BarChart3 size={16} />
          </button>
          <button
            onClick={() => {
              if (showCreator) {
                setShowCreator(false)
                return
              }
              openStudioForCreate()
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors shadow-sm"
          >
            <Plus size={14} />
            {showCreator ? 'Hide Studio' : 'New Agent'}
          </button>
        </div>
      </div>

      {showCreator && (
        <TemplateStudio
          key={`agent-studio:${editingDraftId || 'create'}:${editorSeed}`}
          mode="agent"
          initialAgentForm={editingDraft?.form}
          submitLabel="Save Local Template"
          onCreateAgentDraft={handleCreateLocalDraft}
        />
      )}

      {actionMessage && (
        <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
          {actionMessage}
        </div>
      )}

      {localDraftAgents.length > 0 && (
        <GlassCard title="Local Agent Templates" subtitle="Persisted in localStorage and editable inside Template Studio">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {localDraftAgents.map((draft) => (
              <div key={draft.preview.id} className="glass-subtle rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {renamingDraftId === draft.preview.id ? (
                      <div className="space-y-2">
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          className="w-full rounded-xl bg-[var(--color-glass-bg)] px-3 py-2 text-sm text-text-primary outline-none"
                          placeholder="Draft name"
                        />
                        <div className="flex items-center gap-2">
                          <button onClick={() => commitRenameDraft(draft.preview.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent text-white text-[11px] font-medium hover:bg-accent-light transition-colors">
                            <Check size={12} />
                            Save
                          </button>
                          <button onClick={cancelRenameDraft} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--color-glass-subtle)] text-text-secondary text-[11px] font-medium hover:text-accent transition-colors">
                            <X size={12} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-text-primary truncate">{draft.preview.name}</div>
                        <div className="text-[10px] text-text-tertiary mt-1 break-all">{draft.preview.id}</div>
                        <div className="text-[10px] text-text-tertiary mt-2">Updated {draft.updatedAt}</div>
                      </>
                    )}
                  </div>
                  {renamingDraftId !== draft.preview.id && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => openStudioForEdit(draft.preview.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors">
                        <PencilLine size={12} />
                        Edit
                      </button>
                      <button onClick={() => startRenameDraft(draft)} className="w-8 h-8 rounded-xl bg-[var(--color-glass-subtle)] flex items-center justify-center text-text-secondary hover:text-accent transition-colors">
                        <PencilLine size={13} />
                      </button>
                      <button onClick={() => deleteDraft(draft.preview.id)} className="w-8 h-8 rounded-xl bg-danger/10 flex items-center justify-center text-danger hover:bg-danger/20 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4">
        {/* Agent Grid/List */}
        <div className={selectedAgent ? 'lg:col-span-8' : 'lg:col-span-12'}>
          {view === 'grid' ? (
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${selectedAgent ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-3`}>
              {filtered.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`glass p-4 rounded-2xl cursor-pointer transition-all duration-200 hover:shadow-md ${
                    selectedAgentId === agent.id ? 'ring-2 ring-accent/30 bg-[var(--color-glass)]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center">
                        <Bot size={18} className="text-accent" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-text-primary">{agent.name}</h4>
                        <p className="text-[10px] text-text-tertiary">{agent.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {agent.model.endsWith('/draft') && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-info/10 text-info">
                          local
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusStyles[agent.status]}`}>
                        {agent.status}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-text-tertiary mb-2 px-1 py-0.5 glass-subtle rounded inline-block">
                    {agent.model}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[var(--color-glass-border)]">
                    <div className="text-center">
                      <div className="text-xs font-bold text-text-primary">{agent.sessions}</div>
                      <div className="text-[9px] text-text-tertiary">Sessions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-text-primary">{agent.tokensUsed}</div>
                      <div className="text-[9px] text-text-tertiary">Tokens</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-text-primary">{agent.successRate}%</div>
                      <div className="text-[9px] text-text-tertiary">Success</div>
                    </div>
                  </div>

                  {agent.model.endsWith('/draft') && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        openStudioForEdit(agent.id)
                      }}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
                    >
                      <PencilLine size={13} />
                      Edit Template
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <GlassCard padding="sm">
              <div className="space-y-1">
                {filtered.map((agent) => (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      selectedAgentId === agent.id ? 'bg-accent/5' : 'hover:bg-[var(--color-glass-hover)]'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
                    <Bot size={16} className="text-accent" />
                    <span className="text-sm font-medium text-text-primary flex-1">{agent.name}</span>
                    <span className="text-[10px] text-text-tertiary">{agent.model}</span>
                    <span className="text-xs text-text-secondary">{agent.tokensUsed}</span>
                    <span className="text-xs text-text-secondary">{agent.uptime}</span>
                    <ChevronRight size={14} className="text-text-tertiary" />
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="text-center py-8 text-text-tertiary text-xs">No agents match your search.</div>
                )}
              </div>
            </GlassCard>
          )}
        </div>

        {/* Agent Detail Panel */}
        {selectedAgent && (
          <div className="lg:col-span-4 space-y-3 animate-slide-in">
            <GlassCard variant="strong">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center">
                    <Bot size={18} className="text-accent" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">{selectedAgent.name}</h4>
                    <p className="text-[10px] text-text-tertiary">{selectedAgent.id}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAgentId(null)} className="w-7 h-7 rounded-lg hover:bg-[var(--color-glass-hover)] flex items-center justify-center">
                  <X size={14} className="text-text-tertiary" />
                </button>
              </div>

              {/* Config Fields */}
              <div className="space-y-3 mb-4">
                {selectedAgent.model.endsWith('/draft') && (
                  <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info">
                    This is a local template created from Template Studio.
                  </div>
                )}
                {selectedDraft && (
                  <div className="rounded-xl px-3 py-2 text-xs bg-[var(--color-glass-subtle)] text-text-secondary">
                    Last updated: {selectedDraft.updatedAt}
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-text-tertiary uppercase tracking-wider">Model</label>
                  <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs text-text-primary">{selectedAgent.model}</div>
                </div>
                <div>
                  <label className="text-[10px] text-text-tertiary uppercase tracking-wider">Workspace</label>
                  <div className="mt-1 glass-subtle rounded-lg px-3 py-2 text-xs text-text-primary font-mono">{selectedAgent.workspace}</div>
                </div>
                {selectedDraft && (
                  <div>
                    <label className="text-[10px] text-text-tertiary uppercase tracking-wider">Linked Local Skills</label>
                    <div className="mt-1 space-y-2">
                      {linkedSkillDrafts.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {linkedSkillDrafts.map((draft) => (
                            <span key={draft.preview.id} className="text-[10px] px-2 py-1 rounded-full bg-accent/10 text-accent">
                              {draft.preview.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {missingSkillLinks.length > 0 && (
                        <div className="rounded-xl px-3 py-2 text-[10px] bg-warning/10 text-warning">
                          Missing local skill templates: {missingSkillLinks.join(', ')}
                        </div>
                      )}
                      {linkedSkillDrafts.length === 0 && missingSkillLinks.length === 0 && (
                        <div className="rounded-xl px-3 py-2 text-[10px] bg-[var(--color-glass-subtle)] text-text-secondary">
                          This local template does not reference any local skill templates yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {selectedDraft ? (
                  <>
                    <button
                      onClick={() => openStudioForEdit(selectedDraft.preview.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors"
                    >
                      <PencilLine size={13} />
                      Edit Template
                    </button>
                    <button onClick={() => handlePendingAction('Draft runtime activation')} className="w-9 h-9 rounded-xl glass flex items-center justify-center text-text-secondary hover:text-accent transition-colors">
                      <Settings2 size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handlePendingAction(selectedAgent.status === 'active' ? 'Agent pause' : 'Agent start')} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors">
                      {selectedAgent.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                      {selectedAgent.status === 'active' ? 'Pause' : 'Start'}
                    </button>
                    <button onClick={() => handlePendingAction('Agent settings')} className="w-9 h-9 rounded-xl glass flex items-center justify-center text-text-secondary hover:text-accent transition-colors">
                      <Settings2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </GlassCard>

            {/* Performance */}
            <GlassCard title="Performance" subtitle="Estimated preview from current session volume">
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'Avg Latency', value: '320ms', icon: Clock },
                  { label: 'Token/day', value: '18K', icon: Cpu },
                  { label: 'Success', value: `${selectedAgent.successRate}%`, icon: Zap },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="glass-subtle rounded-lg p-2 text-center">
                    <Icon size={12} className="text-accent mx-auto mb-1" />
                    <div className="text-xs font-bold text-text-primary">{label === 'Avg Latency' ? `${Math.max(80, 420 - selectedAgent.sessions * 18)}ms` : value}</div>
                    <div className="text-[9px] text-text-tertiary">{label}</div>
                  </div>
                ))}
              </div>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={perfData}>
                    <defs>
                      <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="d" hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(255,255,255,0.8)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.4)',
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    />
                    <Area type="monotone" dataKey="calls" stroke="#6366f1" strokeWidth={2} fill="url(#perfGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-[10px] text-text-tertiary">
                This chart is still a front-end estimate. Real per-agent latency, token rate, and run history remain pending live gateway telemetry.
              </p>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  )
}
