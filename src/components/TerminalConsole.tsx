import { useState, useEffect, useRef, useCallback } from 'react'
import { Terminal, X, Minimize2, Maximize2, Trash2 } from 'lucide-react'
import { useConnectionStatus, useOpenClawEvent } from '../hooks/useOpenClaw'
import { openclawClient } from '../lib/openclaw-client'
import { mockTerminalLogs } from '../lib/mock-data'

interface LogEntry {
  time: string
  level: 'info' | 'debug' | 'warn' | 'error'
  msg: string
}

const levelColors: Record<string, string> = {
  info: 'text-info',
  debug: 'text-text-tertiary',
  warn: 'text-warning',
  error: 'text-danger',
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function TerminalConsole({ open, onClose }: Props) {
  const [minimized, setMinimized] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>(mockTerminalLogs)
  const [filter, setFilter] = useState<string>('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const status = useConnectionStatus()
  const pushLog = useCallback((entry: LogEntry) => {
    setLogs(prev => [...prev.slice(-500), entry])
  }, [])

  // Listen for real-time events and append to logs
  useOpenClawEvent('*', (event) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    pushLog({
      time: now,
      level: 'info',
      msg: `[${event.event}] ${JSON.stringify(event.payload).slice(0, 200)}`,
    })
  })

  // Auto-scroll
  useEffect(() => {
    if (open && !minimized) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, open, minimized])

  // Add connection status changes as log entries
  useEffect(() => {
    return openclawClient.onStatus((nextStatus) => {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      pushLog({
        time: now,
        level: nextStatus === 'connected' ? 'info' : nextStatus === 'error' ? 'error' : 'warn',
        msg: `[gateway] Connection status: ${nextStatus}`,
      })
    })
  }, [pushLog])

  const filteredLogs = filter
    ? logs.filter(l => l.msg.toLowerCase().includes(filter.toLowerCase()) || l.level === filter)
    : logs

  if (!open) return null

  return (
    <div className={`fixed bottom-0 left-0 md:left-[72px] right-0 z-50 transition-all duration-300 ${minimized ? 'h-10' : 'h-72'}`}>
      <div className="glass-strong h-full flex flex-col rounded-t-2xl border-t border-[var(--color-glass-border)] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-glass-border-subtle)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-accent" />
            <span className="text-xs font-medium text-text-primary">Terminal Console</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded glass-subtle ${status === 'connected' ? 'text-success' : 'text-text-tertiary'}`}>
              {status === 'connected' ? 'Live' : 'Mock'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!minimized && (
              <input
                type="text"
                placeholder="Filter..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-[var(--color-glass-subtle)] rounded-md px-2 py-0.5 text-[10px] text-text-primary outline-none w-28 placeholder-text-tertiary"
              />
            )}
            <button onClick={() => setLogs([])} className="w-6 h-6 rounded-lg hover:bg-[var(--color-glass-hover)] flex items-center justify-center text-text-tertiary transition-colors" title="Clear" aria-label="Clear terminal logs">
              <Trash2 size={11} />
            </button>
            <button onClick={() => setMinimized(!minimized)} className="w-6 h-6 rounded-lg hover:bg-[var(--color-glass-hover)] flex items-center justify-center text-text-tertiary transition-colors" aria-label={minimized ? 'Maximize terminal' : 'Minimize terminal'}>
              {minimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
            </button>
            <button onClick={onClose} className="w-6 h-6 rounded-lg hover:bg-[var(--color-glass-hover)] flex items-center justify-center text-text-tertiary transition-colors" aria-label="Close terminal">
              <X size={12} />
            </button>
          </div>
        </div>

        {!minimized && (
          <div className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-0.5">
            {filteredLogs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-text-tertiary/60 flex-shrink-0">{log.time}</span>
                <span className={`flex-shrink-0 w-12 ${levelColors[log.level]}`}>[{log.level}]</span>
                <span className="text-text-secondary break-all">{log.msg}</span>
              </div>
            ))}
            <div ref={bottomRef} className="flex items-center gap-1 text-text-tertiary/40 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-success' : 'bg-text-tertiary'} pulse-dot`} />
              <span>Waiting for new events...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
