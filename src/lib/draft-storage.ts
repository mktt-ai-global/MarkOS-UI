import type { AgentInfo, SkillInfo } from './mock-data'
import type { AgentTemplateForm, SkillTemplateForm } from './template-studio'
import { canUseStorage, isRecord } from './utils.ts'

export interface LocalAgentDraft {
  preview: AgentInfo
  form: AgentTemplateForm
  updatedAt: string
}

export interface LocalSkillDraft {
  preview: SkillInfo
  form: SkillTemplateForm
  updatedAt: string
}

const AGENT_DRAFTS_KEY = 'openclaw_ui_agent_drafts_v1'
const SKILL_DRAFTS_KEY = 'openclaw_ui_skill_drafts_v1'
const DRAFT_STORAGE_EVENT = 'openclaw-ui:draft-storage-updated'

function nowLabel(): string {
  return new Date().toLocaleString()
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function hasStringFields(value: unknown, keys: string[]): boolean {
  return isRecord(value) && keys.every((key) => isString(value[key]))
}

function isAgentInfo(value: unknown): value is AgentInfo {
  if (!hasStringFields(value, [
    'id',
    'name',
    'model',
    'tokensUsed',
    'uptime',
    'lastActive',
    'workspace',
  ])) {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.sessions === 'number' &&
    typeof record.successRate === 'number' &&
    ['active', 'idle', 'stopped'].includes(record.status as string)
}

function isSkillInfo(value: unknown): value is SkillInfo {
  if (!hasStringFields(value, [
    'id',
    'name',
    'description',
    'version',
    'author',
  ])) {
    return false
  }

  const record = value as Record<string, unknown>
  return typeof record.installed === 'boolean' &&
    typeof record.usage === 'number' &&
    typeof record.rating === 'number' &&
    ['tool', 'api', 'custom', 'system'].includes(record.category as string)
}

const agentTemplateFormKeys: Array<keyof AgentTemplateForm> = [
  'id',
  'name',
  'owner',
  'version',
  'status',
  'type',
  'priority',
  'purpose',
  'mission',
  'responsibilities',
  'nonResponsibilities',
  'inputs',
  'outputs',
  'successCriteria',
  'failureModes',
  'allowedTools',
  'allowedSkills',
  'handoffs',
  'guardrails',
  'observability',
  'toolPolicies',
  'qualityBar',
  'recoveryRules',
  'tone',
  'memorySchemaFields',
  'outputSchemaFields',
]

const skillTemplateFormKeys: Array<keyof SkillTemplateForm> = [
  'id',
  'name',
  'owner',
  'version',
  'status',
  'category',
  'description',
  'purpose',
  'whenToUse',
  'whenNotToUse',
  'inputs',
  'outputs',
  'procedure',
  'qualityStandard',
  'failureModes',
  'dependencies',
  'notes',
  'invokableBy',
  'tags',
  'requiredInputs',
  'optionalInputs',
  'qualityGates',
  'timeoutSeconds',
  'determinism',
  'sideEffects',
  'outputFormat',
  'inputSchemaFields',
  'outputSchemaFields',
]

function isAgentTemplateForm(value: unknown): value is AgentTemplateForm {
  return hasStringFields(value, agentTemplateFormKeys)
}

function isSkillTemplateForm(value: unknown): value is SkillTemplateForm {
  return hasStringFields(value, skillTemplateFormKeys)
}

function isLocalAgentDraft(value: unknown): value is LocalAgentDraft {
  return isRecord(value) &&
    isAgentInfo(value.preview) &&
    isAgentTemplateForm(value.form) &&
    isString(value.updatedAt)
}

function isLocalSkillDraft(value: unknown): value is LocalSkillDraft {
  return isRecord(value) &&
    isSkillInfo(value.preview) &&
    isSkillTemplateForm(value.form) &&
    isString(value.updatedAt)
}

function emitDraftStorageUpdate(kind: 'agent' | 'skill') {
  if (!canUseStorage() || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(DRAFT_STORAGE_EVENT, { detail: { kind } }))
}

function parseStoredDrafts<T>(key: string, validator: (value: unknown) => value is T): T[] {
  if (!canUseStorage()) return []

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(validator) : []
  } catch {
    return []
  }
}

function writeStoredDrafts<T>(key: string, drafts: T[]) {
  if (!canUseStorage()) return

  window.localStorage.setItem(key, JSON.stringify(drafts))
}

export function loadAgentDrafts(): LocalAgentDraft[] {
  return parseStoredDrafts<LocalAgentDraft>(AGENT_DRAFTS_KEY, isLocalAgentDraft)
}

export function loadSkillDrafts(): LocalSkillDraft[] {
  return parseStoredDrafts<LocalSkillDraft>(SKILL_DRAFTS_KEY, isLocalSkillDraft)
}

export function persistAgentDrafts(drafts: LocalAgentDraft[]) {
  writeStoredDrafts(AGENT_DRAFTS_KEY, drafts)
  emitDraftStorageUpdate('agent')
}

export function persistSkillDrafts(drafts: LocalSkillDraft[]) {
  writeStoredDrafts(SKILL_DRAFTS_KEY, drafts)
  emitDraftStorageUpdate('skill')
}

function subscribeToDraftUpdates(storageKey: string, kind: 'agent' | 'skill', callback: () => void): () => void {
  if (!canUseStorage() || typeof window.addEventListener !== 'function') {
    return () => {}
  }

  const handleStorage = (event: Event) => {
    const storageEvent = event as StorageEvent
    if (!storageEvent.key || storageEvent.key === storageKey) {
      callback()
    }
  }

  const handleCustom = (event: Event) => {
    const customEvent = event as CustomEvent<{ kind?: string }>
    if (customEvent.detail?.kind === kind) {
      callback()
    }
  }

  window.addEventListener('storage', handleStorage)
  window.addEventListener(DRAFT_STORAGE_EVENT, handleCustom as EventListener)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(DRAFT_STORAGE_EVENT, handleCustom as EventListener)
  }
}

export function subscribeAgentDrafts(callback: () => void): () => void {
  return subscribeToDraftUpdates(AGENT_DRAFTS_KEY, 'agent', callback)
}

export function subscribeSkillDrafts(callback: () => void): () => void {
  return subscribeToDraftUpdates(SKILL_DRAFTS_KEY, 'skill', callback)
}

export function stampAgentDraft(preview: AgentInfo, form: AgentTemplateForm): LocalAgentDraft {
  return {
    preview,
    form,
    updatedAt: nowLabel(),
  }
}

export function stampSkillDraft(preview: SkillInfo, form: SkillTemplateForm): LocalSkillDraft {
  return {
    preview,
    form,
    updatedAt: nowLabel(),
  }
}

export function renameAgentDraftEntry(draft: LocalAgentDraft, nextName: string): LocalAgentDraft {
  return {
    ...draft,
    preview: {
      ...draft.preview,
      name: nextName,
    },
    form: {
      ...draft.form,
      name: nextName,
    },
    updatedAt: nowLabel(),
  }
}

export function renameSkillDraftEntry(draft: LocalSkillDraft, nextName: string): LocalSkillDraft {
  return {
    ...draft,
    preview: {
      ...draft.preview,
      name: nextName,
    },
    form: {
      ...draft.form,
      name: nextName,
    },
    updatedAt: nowLabel(),
  }
}
