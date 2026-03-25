import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadAgentDrafts,
  loadSkillDrafts,
  persistAgentDrafts,
  persistSkillDrafts,
  renameAgentDraftEntry,
  renameSkillDraftEntry,
  stampAgentDraft,
  stampSkillDraft,
} from '../src/lib/draft-storage.ts'
import {
  buildAgentDraft,
  buildSkillDraft,
  createAgentTemplateForm,
  createSkillTemplateForm,
} from '../src/lib/template-studio.ts'

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }
}

function installWindowWithStorage() {
  const localStorage = new MemoryStorage()
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage },
    configurable: true,
    writable: true,
  })
  return localStorage
}

function uninstallWindow() {
  Reflect.deleteProperty(globalThis, 'window')
}

test('agent drafts persist and load from browser storage', () => {
  const localStorage = installWindowWithStorage()

  try {
    const form = createAgentTemplateForm('planner')
    form.name = 'Saved Planner'
    const draft = stampAgentDraft(buildAgentDraft(form), form)

    persistAgentDrafts([draft])

    assert.equal(localStorage.getItem('openclaw_ui_agent_drafts_v1') !== null, true)
    assert.equal(loadAgentDrafts().length, 1)
    assert.equal(loadAgentDrafts()[0].form.name, 'Saved Planner')
  } finally {
    uninstallWindow()
  }
})

test('skill draft renaming keeps preview and form names in sync', () => {
  installWindowWithStorage()

  try {
    const form = createSkillTemplateForm('write-prd')
    const draft = stampSkillDraft(buildSkillDraft(form), form)
    const renamed = renameSkillDraftEntry(draft, 'Release Writer')

    persistSkillDrafts([renamed])

    assert.equal(renamed.preview.name, 'Release Writer')
    assert.equal(renamed.form.name, 'Release Writer')
    assert.equal(loadSkillDrafts()[0].preview.name, 'Release Writer')
  } finally {
    uninstallWindow()
  }
})

test('invalid stored draft json falls back to an empty list', () => {
  const localStorage = installWindowWithStorage()

  try {
    localStorage.setItem('openclaw_ui_agent_drafts_v1', '{broken-json')
    assert.deepEqual(loadAgentDrafts(), [])
  } finally {
    uninstallWindow()
  }
})

test('malformed stored draft entries are filtered out', () => {
  const localStorage = installWindowWithStorage()

  try {
    localStorage.setItem('openclaw_ui_agent_drafts_v1', JSON.stringify([
      {
        preview: { id: 'agent-1', name: 'Broken Draft' },
        form: { name: 'Broken Draft' },
        updatedAt: 'today',
      },
    ]))

    assert.deepEqual(loadAgentDrafts(), [])
  } finally {
    uninstallWindow()
  }
})

test('agent draft rename updates both preview and form names', () => {
  installWindowWithStorage()

  try {
    const form = createAgentTemplateForm('architect')
    const draft = stampAgentDraft(buildAgentDraft(form), form)
    const renamed = renameAgentDraftEntry(draft, 'Boundary Architect')

    assert.equal(renamed.preview.name, 'Boundary Architect')
    assert.equal(renamed.form.name, 'Boundary Architect')
  } finally {
    uninstallWindow()
  }
})
