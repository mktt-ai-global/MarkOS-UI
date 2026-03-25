import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultChatPreviewState,
  loadChatPreviewState,
  persistChatPreviewState,
} from '../src/lib/chat-preview-storage.ts'

class MemoryStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
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

test('chat preview state persists and reloads offline sessions and overrides', () => {
  installWindowWithStorage()

  try {
    const state = createDefaultChatPreviewState()
    state.activeConvKey = 'local:session:test'
    state.sessionOverridesByKey['local:session:test'] = {
      model: 'anthropic/claude-sonnet',
      maxTokens: '4096',
      toolMode: 'allow',
      notes: 'Persist me',
    }

    persistChatPreviewState(state)
    const reloaded = loadChatPreviewState()

    assert.equal(reloaded.activeConvKey, 'local:session:test')
    assert.equal(reloaded.sessionOverridesByKey['local:session:test']?.notes, 'Persist me')
    assert.equal(reloaded.offlineSessions.length > 0, true)
  } finally {
    uninstallWindow()
  }
})

test('chat preview loader falls back safely when stored shape is malformed', () => {
  const localStorage = installWindowWithStorage()

  try {
    localStorage.setItem('openclaw_ui_chat_preview_state_v1', JSON.stringify({
      activeConvKey: 42,
      offlineSessions: [{ id: 'broken' }],
      offlineMessagesBySession: {
        broken: [{ id: 'm1', role: 'assistant', content: 'ok', timestamp: 'now' }, { nope: true }],
      },
      sessionOverridesByKey: {
        broken: { model: 'x', maxTokens: '1', toolMode: 'allow', notes: 'ok' },
        invalid: { notes: 'missing fields' },
      },
      liveRunItemsBySession: {
        broken: [{ id: 'run-1', sessionKey: 'broken', kind: 'status', label: 'started', detail: 'ok', timestamp: 'now', eventName: 'chat.start' }],
      },
    }))

    const reloaded = loadChatPreviewState()

    assert.equal(typeof reloaded.activeConvKey, 'string')
    assert.equal(reloaded.offlineSessions.length, 0)
    assert.equal(reloaded.offlineMessagesBySession.broken?.length, 1)
    assert.equal(reloaded.sessionOverridesByKey.broken?.toolMode, 'allow')
    assert.equal('invalid' in reloaded.sessionOverridesByKey, false)
    assert.equal(reloaded.liveRunItemsBySession.broken?.length, 1)
  } finally {
    uninstallWindow()
  }
})
