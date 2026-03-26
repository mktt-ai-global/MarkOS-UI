import { isRecord } from './utils.ts'

export type DraftFieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'string-list'
export type DraftFieldValue = string | boolean

export interface DraftField {
  path: string
  label: string
  section: string
  kind: DraftFieldKind
  options?: string[]
  description?: string
}

export interface DraftChange {
  field: DraftField
  current: unknown
  next: unknown
}

export interface DraftAnalysis {
  patch: Record<string, unknown>
  changes: DraftChange[]
  invalidFields: DraftField[]
}

type UnknownRecord = Record<string, unknown>

export function unwrapPayload(value: unknown): unknown {
  if (!isRecord(value)) return value

  for (const key of ['payload', 'data', 'result']) {
    if (key in value) {
      return value[key]
    }
  }

  return value
}

function titleizeSegment(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getNestedValue(record: unknown, path: string[]): unknown {
  let current = unwrapPayload(record)

  for (const segment of path) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined
    }
    current = current[segment]
  }

  return current
}

export function buildDraftFields(schema: unknown, path: string[] = []): DraftField[] {
  const unwrapped = unwrapPayload(schema)
  if (!isRecord(unwrapped)) return []

  const properties = isRecord(unwrapped.properties) ? unwrapped.properties : null
  if (properties) {
    return Object.entries(properties).flatMap(([key, child]) => buildDraftFields(child, [...path, key]))
  }

  if (path.length === 0) return []

  const rawType = typeof unwrapped.type === 'string' ? unwrapped.type : ''
  const options = Array.isArray(unwrapped.enum)
    ? unwrapped.enum.filter((item): item is string => typeof item === 'string')
    : []
  const section = titleizeSegment(path[0])
  const label = titleizeSegment(path[path.length - 1])
  const description = typeof unwrapped.description === 'string' ? unwrapped.description : undefined

  if (options.length > 0) {
    return [{ path: path.join('.'), label, section, kind: 'enum', options, description }]
  }

  if (rawType === 'number' || rawType === 'integer') {
    return [{ path: path.join('.'), label, section, kind: 'number', description }]
  }

  if (rawType === 'boolean') {
    return [{ path: path.join('.'), label, section, kind: 'boolean', description }]
  }

  if (rawType === 'array') {
    const items = isRecord(unwrapped.items) ? unwrapped.items : null
    if (items?.type === 'string') {
      return [{ path: path.join('.'), label, section, kind: 'string-list', description }]
    }
    return []
  }

  if (rawType === 'string' || !rawType) {
    return [{ path: path.join('.'), label, section, kind: 'string', description }]
  }

  return []
}

export function serializeDraftValue(field: DraftField, value: unknown): DraftFieldValue {
  if (field.kind === 'boolean') {
    return value === true
  }

  if (field.kind === 'string-list') {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .join('\n')
    }
    return typeof value === 'string' ? value : ''
  }

  if (field.kind === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) return `${value}`
    if (typeof value === 'string') return value
    return ''
  }

  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export function parseDraftValue(field: DraftField, value: DraftFieldValue): unknown {
  if (field.kind === 'boolean') {
    return value === true
  }

  if (field.kind === 'number') {
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) return undefined
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : Number.NaN
  }

  if (field.kind === 'string-list') {
    return (typeof value === 'string' ? value : '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return typeof value === 'string' ? value : ''
}

export function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : '[empty]'
  }

  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === undefined) return '[unset]'
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assignNestedValue(target: UnknownRecord, path: string[], value: unknown) {
  let cursor: UnknownRecord = target

  for (const segment of path.slice(0, -1)) {
    if (!isRecord(cursor[segment])) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as UnknownRecord
  }

  cursor[path[path.length - 1]] = value
}

export function buildInitialDraftValues(
  fields: DraftField[],
  configObject: unknown,
): Record<string, DraftFieldValue> {
  return Object.fromEntries(
    fields.map((field) => [field.path, serializeDraftValue(field, getNestedValue(configObject, field.path.split('.')))]),
  )
}

export function analyzeConfigDraft(
  fields: DraftField[],
  configObject: unknown,
  effectiveConfigDraft: Record<string, DraftFieldValue>,
): DraftAnalysis {
  const patch: UnknownRecord = {}
  const changes: DraftChange[] = []
  const invalidFields: DraftField[] = []

  for (const field of fields) {
    const draftValue = effectiveConfigDraft[field.path]
    const currentValue = getNestedValue(configObject, field.path.split('.'))
    const nextValue = parseDraftValue(field, draftValue)

    if (field.kind === 'number' && typeof nextValue === 'number' && Number.isNaN(nextValue)) {
      invalidFields.push(field)
      continue
    }

    if (nextValue === undefined) continue

    if (valuesEqual(currentValue, nextValue)) continue

    changes.push({ field, current: currentValue, next: nextValue })
    assignNestedValue(patch, field.path.split('.'), nextValue)
  }

  return {
    patch,
    changes,
    invalidFields,
  }
}
