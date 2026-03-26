import { useEffect, useRef, useState } from 'react'
import {
  Check,
  PencilLine,
  Puzzle,
  Search,
  Download,
  Code,
  Globe,
  Image,
  FileText,
  Terminal,
  Package,
  Star,
  Filter,
  ChevronRight,
  CheckCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import GlassCard from '../components/GlassCard'
import TemplateStudio from '../components/TemplateStudio'
import { normalizeSkills } from '../lib/openclaw-adapters'
import { useGatewayData } from '../hooks/useOpenClaw'
import { splitLines } from '../lib/utils'
import { mockSkills, type SkillInfo } from '../lib/mock-data'
import {
  loadAgentDrafts,
  loadSkillDrafts,
  persistSkillDrafts,
  renameSkillDraftEntry,
  stampSkillDraft,
  subscribeAgentDrafts,
  subscribeSkillDrafts,
  type LocalAgentDraft,
  type LocalSkillDraft,
} from '../lib/draft-storage'
import type { SkillTemplateForm } from '../lib/template-studio'

const categoryStyles: Record<string, string> = {
  tool: 'bg-accent/10 text-accent',
  api: 'bg-info/10 text-info',
  custom: 'bg-warning/10 text-warning',
  system: 'bg-success/10 text-success',
}

export default function Skills() {
  const [tab, setTab] = useState<'store' | 'custom' | 'deps'>('store')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showCreator, setShowCreator] = useState(false)
  const [editorSeed, setEditorSeed] = useState(0)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [localAgentDrafts, setLocalAgentDrafts] = useState<LocalAgentDraft[]>(() => loadAgentDrafts())
  const [localDraftSkills, setLocalDraftSkills] = useState<LocalSkillDraft[]>(() => loadSkillDrafts())
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const dismissRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (dismissRef.current) clearTimeout(dismissRef.current)
    if (!actionMessage) return
    dismissRef.current = setTimeout(() => setActionMessage(null), 4000)
    return () => { if (dismissRef.current) clearTimeout(dismissRef.current) }
  }, [actionMessage])
  const { data: toolsCatalogRaw, isLive: toolsCatalogLive } = useGatewayData<unknown>('tools.catalog', {}, mockSkills, 15000)
  const liveSkills = normalizeSkills(null, toolsCatalogRaw, mockSkills)
  const localDraftPreviews = localDraftSkills.map((draft) => draft.preview)
  const skills = [...localDraftPreviews, ...liveSkills.filter((skill) => !localDraftPreviews.some((draft) => draft.id === skill.id))]
  const isLive = toolsCatalogLive
  const editingDraft = localDraftSkills.find((draft) => draft.preview.id === editingDraftId) || null

  const filteredSkills = skills.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || s.category === categoryFilter
    return matchesSearch && matchesCategory
  })
  const isLocalDraftSkill = (skill: SkillInfo) => localDraftSkills.some((draft) => draft.preview.id === skill.id)
  const getReferencingAgentNames = (skillId: string) => localAgentDrafts
    .filter((draft) => splitLines(draft.form.allowedSkills).includes(skillId))
    .map((draft) => draft.preview.name)
  const dependencies = [
    { name: 'gateway', version: isLive ? 'live' : 'mock', status: isLive ? 'ok' : 'warning', size: `${skills.filter(skill => skill.installed).length} installed` },
    { name: 'tool-catalog', version: `${skills.length} entries`, status: 'ok', size: 'synced' },
    { name: 'custom-scripts', version: `${skills.filter(skill => skill.category === 'custom').length}`, status: skills.some(skill => skill.category === 'custom') ? 'ok' : 'warning', size: 'available' },
    { name: 'api-tools', version: `${skills.filter(skill => skill.category === 'api').length}`, status: skills.some(skill => skill.category === 'api') ? 'ok' : 'warning', size: 'available' },
  ]

  const getSkillIcon = (skill: SkillInfo) => {
    switch (skill.category) {
      case 'api':
        return Globe
      case 'custom':
        return Puzzle
      case 'system':
        return Terminal
      default:
        if (skill.name.toLowerCase().includes('image')) return Image
        if (skill.name.toLowerCase().includes('document')) return FileText
        if (skill.name.toLowerCase().includes('package')) return Package
        return Code
    }
  }

  useEffect(() => {
    persistSkillDrafts(localDraftSkills)
  }, [localDraftSkills])

  useEffect(() => subscribeAgentDrafts(() => {
    setLocalAgentDrafts(loadAgentDrafts())
  }), [])

  useEffect(() => subscribeSkillDrafts(() => {
    setLocalDraftSkills(loadSkillDrafts())
  }), [])

  const openStudioForCreate = () => {
    setEditingDraftId(null)
    setRenamingDraftId(null)
    setEditorSeed((current) => current + 1)
    setTab('custom')
    setShowCreator(true)
    setActionMessage(null)
  }

  const openStudioForEdit = (draftId: string) => {
    setEditingDraftId(draftId)
    setRenamingDraftId(null)
    setEditorSeed((current) => current + 1)
    setTab('custom')
    setShowCreator(true)
    setActionMessage(`Editing local template "${draftId}".`)
  }

  const handleCreateLocalDraft = (draft: SkillInfo, form: SkillTemplateForm) => {
    setLocalDraftSkills((current) => {
      const next = current.filter((item) => item.preview.id !== draft.id)
      return [stampSkillDraft(draft, form), ...next]
    })
    setTab('custom')
    setEditingDraftId(draft.id)
    setShowCreator(true)
    setActionMessage(`Saved local template "${draft.name}".`)
  }

  const startRenameDraft = (draft: LocalSkillDraft) => {
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

    setLocalDraftSkills((current) => current.map((draft) => (
      draft.preview.id === draftId
        ? renameSkillDraftEntry(draft, nextName)
        : draft
    )))
    setRenamingDraftId(null)
    setRenameValue('')
    setActionMessage(`Renamed local template to "${nextName}".`)
  }

  const deleteDraft = (draftId: string) => {
    setLocalDraftSkills((current) => current.filter((draft) => draft.preview.id !== draftId))
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
          <h2 className="text-lg font-semibold text-text-primary">Skills</h2>
          <p className="text-xs text-text-tertiary">{skills.filter(s => s.installed).length} installed, {skills.length} available {isLive ? '(live)' : '(mock)'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-input text-xs flex-1 sm:flex-initial">
            <Search size={14} className="text-text-tertiary" />
            <input
              type="text"
              placeholder="Search skills..."
              className="bg-transparent outline-none text-text-primary placeholder-text-tertiary w-full sm:w-40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => {
              openStudioForCreate()
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-light transition-colors"
          >
            <Plus size={14} />
            Create Skill
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="rounded-xl px-3 py-2 text-xs bg-info/10 text-info flex items-start gap-2">
          <span className="flex-1">{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="flex-shrink-0 hover:opacity-70 transition-opacity"><X size={14} /></button>
        </div>
      )}


      {/* Tabs */}
      <div className="flex gap-1 p-1 glass rounded-xl w-fit">
        {[
          { id: 'store', label: 'Tool Store' },
          { id: 'custom', label: 'Custom Skills' },
          { id: 'deps', label: 'Dependencies' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === id
                ? 'bg-[var(--color-glass-bg)] shadow-sm text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'store' && (
        <>
          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-text-tertiary" />
            {['all', 'tool', 'api', 'custom', 'system'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  categoryFilter === cat
                    ? 'bg-accent text-white'
                    : 'glass-subtle text-text-secondary hover:bg-[var(--color-glass-hover)]'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          {/* Skill Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSkills.map((skill) => {
              const Icon = getSkillIcon(skill)
              return (
                <div key={skill.id} className="glass p-4 rounded-2xl hover:shadow-md transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/10 to-accent-light/10 flex items-center justify-center">
                      <Icon size={18} className="text-accent" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isLocalDraftSkill(skill) && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-info/10 text-info">
                          local
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${categoryStyles[skill.category]}`}>
                        {skill.category}
                      </span>
                    </div>
                  </div>

                  <h4 className="text-sm font-semibold text-text-primary mb-1">{skill.name}</h4>
                  <p className="text-[11px] text-text-tertiary leading-relaxed mb-3 line-clamp-2">{skill.description}</p>

                  <div className="flex items-center justify-between text-[10px] text-text-tertiary">
                    <span>v{skill.version}</span>
                    <div className="flex items-center gap-1">
                      <Star size={10} className="text-warning fill-warning" />
                      <span>{skill.rating}</span>
                    </div>
                    <span>{skill.usage.toLocaleString()} uses</span>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[var(--color-glass-border)]">
                    {skill.installed ? (
                      <div className="flex items-center justify-center gap-1.5 text-xs text-success font-medium">
                        <CheckCircle size={13} />
                        Installed
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button onClick={() => setActionMessage(`Installing "${skill.name}" is not exposed by the current gateway API in this UI yet.`)} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors">
                          <Download size={13} />
                          Install
                        </button>
                        {isLocalDraftSkill(skill) && (
                          <button
                            onClick={() => openStudioForEdit(skill.id)}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[var(--color-glass-subtle)] text-text-secondary text-xs font-medium hover:text-accent transition-colors"
                          >
                            <PencilLine size={13} />
                            Edit Template
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {filteredSkills.length === 0 && (
            <div className="text-center py-8 text-text-tertiary text-xs">No skills match the current filters.</div>
          )}
        </>
      )}

      {tab === 'custom' && (
        <div className="space-y-3">
          <GlassCard title="Custom Skill Templates" subtitle="Engineering-grade scaffolds generated from import or questionnaire">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-xs text-text-tertiary">
                Build template-based skills here, keep them as local templates for now, and wire runtime install later when OpenClaw is available locally.
              </div>
              <button
                onClick={() => {
                  if (showCreator) {
                    setShowCreator(false)
                    return
                  }
                  if (editingDraftId) {
                    openStudioForEdit(editingDraftId)
                    return
                  }
                  openStudioForCreate()
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 transition-colors"
              >
                <Terminal size={14} />
                {showCreator ? 'Hide Studio' : 'Open Studio'}
              </button>
            </div>
          </GlassCard>

          {showCreator && (
            <TemplateStudio
              key={`skill-studio:${editingDraftId || 'create'}:${editorSeed}`}
              mode="skill"
              initialSkillForm={editingDraft?.form}
              submitLabel="Save Local Template"
              onCreateSkillDraft={handleCreateLocalDraft}
            />
          )}

          {localDraftSkills.length > 0 && (
            <GlassCard title="Local Skill Templates" subtitle="Persisted in localStorage and reusable across the local UI">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {localDraftSkills.map((draft) => (
                  <div key={draft.preview.id} className="glass-subtle rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      {renamingDraftId === draft.preview.id ? (
                        <div className="w-full space-y-2">
                          <input
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            className="w-full rounded-xl bg-[var(--color-glass-bg)] px-3 py-2 text-sm text-text-primary outline-none"
                            placeholder="Template name"
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
                          <div>
                            <div className="text-sm font-semibold text-text-primary">{draft.preview.name}</div>
                            <div className="text-[10px] text-text-tertiary mt-1">{draft.preview.id}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-info/10 text-info">local</span>
                            <button
                              onClick={() => openStudioForEdit(draft.preview.id)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
                            >
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
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-text-tertiary mt-3 leading-relaxed">{draft.preview.description}</div>
                    <div className="flex items-center gap-2 mt-3 text-[10px] text-text-tertiary">
                      <span>v{draft.preview.version}</span>
                      <span>{draft.preview.category}</span>
                      <span>{draft.preview.author}</span>
                      <span>Updated {draft.updatedAt}</span>
                    </div>
                    {getReferencingAgentNames(draft.preview.id).length > 0 && (
                      <div className="mt-3 rounded-xl px-3 py-2 text-[10px] bg-accent/10 text-accent">
                        Referenced by local agents: {getReferencingAgentNames(draft.preview.id).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {tab === 'deps' && (
        <GlassCard title="Environment Dependencies" subtitle="Runtime packages and isolation status">
          <div className="space-y-2">
            {dependencies.map((dep) => (
              <div key={dep.name} className="flex items-center gap-3 p-3 rounded-xl glass-subtle">
                <Package size={16} className="text-accent" />
                <div className="flex-1">
                  <div className="text-xs font-medium text-text-primary">{dep.name}</div>
                  <div className="text-[10px] text-text-tertiary">{dep.version}</div>
                </div>
                <span className="text-[10px] text-text-tertiary">{dep.size}</span>
                <span className={`w-2 h-2 rounded-full ${dep.status === 'ok' ? 'bg-success' : 'bg-warning'}`} />
                <ChevronRight size={14} className="text-text-tertiary" />
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}
