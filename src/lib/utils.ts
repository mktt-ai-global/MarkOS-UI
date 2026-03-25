/** Type guard: value is a non-null object (plain record). */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Check whether localStorage is available and functional. */
export function canUseStorage(): boolean {
  try {
    const testKey = '__openclaw_storage_test__'
    window.localStorage.setItem(testKey, '1')
    window.localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/** Split a multi-line string into trimmed, non-empty lines. */
export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
}
