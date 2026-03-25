import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import TerminalConsole from './components/TerminalConsole'
import NotificationToast, { type Notification } from './components/NotificationToast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { openclawClient, type ConnectionStatus } from './lib/openclaw-client'
import { canUseStorage } from './lib/utils'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Agents = lazy(() => import('./pages/Agents'))
const Skills = lazy(() => import('./pages/Skills'))
const Chat = lazy(() => import('./pages/Chat'))
const Settings = lazy(() => import('./pages/Settings'))
const Cron = lazy(() => import('./pages/Cron'))
const Devices = lazy(() => import('./pages/Devices'))
const Approvals = lazy(() => import('./pages/Approvals'))
const UI_THEME_KEY = 'openclaw_ui_theme_v1'

type UITheme = 'frost' | 'midnight'

interface NotificationHistoryEntry extends Notification {
  createdAt: string
  unread: boolean
}

function loadThemePreference(): UITheme {
  if (!canUseStorage()) return 'frost'
  const stored = window.localStorage.getItem(UI_THEME_KEY)
  return stored === 'midnight' ? 'midnight' : 'frost'
}

function applyTheme(theme: UITheme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.uiTheme = theme
}

function buildConnectionNotification(status: ConnectionStatus): Notification {
  const lastError = openclawClient.getLastError()
  const lastErrorDetails = openclawClient.getLastErrorDetails()
  const errorCode = lastErrorDetails?.code?.toUpperCase() || ''

  if (status === 'connected') {
    return {
      id: crypto.randomUUID(),
      type: 'success',
      title: 'Gateway Connected',
      message: 'Connected to the OpenClaw gateway.',
    }
  }

  if (status === 'error') {
    if (errorCode.includes('PAIR')) {
      return {
        id: crypto.randomUUID(),
        type: 'warning',
        title: 'Pairing Required',
        message: 'Approve this browser device from a trusted OpenClaw session, then reconnect.',
      }
    }

    if (errorCode.includes('ORIGIN')) {
      return {
        id: crypto.randomUUID(),
        type: 'error',
        title: 'Origin Not Allowed',
        message: 'Add this site to gateway.allowedOrigins and reconnect over HTTPS/WSS.',
      }
    }

    if (errorCode.includes('AUTH') || errorCode.includes('UNAUTHORIZED')) {
      return {
        id: crypto.randomUUID(),
        type: 'error',
        title: 'Gateway Auth Failed',
        message: lastError || 'The gateway rejected this token or password.',
      }
    }

    return {
      id: crypto.randomUUID(),
      type: 'error',
      title: 'Gateway Error',
      message: lastError || 'Unable to connect to the OpenClaw gateway. Check the URL and token.',
    }
  }

  return {
    id: crypto.randomUUID(),
    type: 'warning',
    title: 'Gateway Disconnected',
    message: lastError || 'The OpenClaw gateway connection was lost.',
  }
}

export default function App() {
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryEntry[]>([])
  const [theme, setTheme] = useState<UITheme>(() => loadThemePreference())

  const unreadNotificationCount = useMemo(
    () => notificationHistory.filter((item) => item.unread).length,
    [notificationHistory],
  )

  const appendNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => [...prev, notification])
    setNotificationHistory((prev) => [
      {
        ...notification,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unread: true,
      },
      ...prev,
    ].slice(0, 12))
  }, [])

  useEffect(() => {
    openclawClient.connect()
    return () => openclawClient.disconnect()
  }, [])

  useEffect(() => {
    applyTheme(theme)
    if (canUseStorage()) {
      window.localStorage.setItem(UI_THEME_KEY, theme)
    }
  }, [theme])

  useEffect(() => {
    let previousStatus = openclawClient.getConnectionStatus()

    return openclawClient.onStatus((nextStatus) => {
      if (previousStatus === nextStatus) return
      if (nextStatus === 'connecting') {
        previousStatus = nextStatus
        return
      }
      if (nextStatus === 'disconnected' && previousStatus !== 'connected') {
        previousStatus = nextStatus
        return
      }

      previousStatus = nextStatus
      appendNotification(buildConnectionNotification(nextStatus))
    })
  }, [appendNotification])

  useEffect(() => {
    if (notifications.length === 0) return
    const timer = setTimeout(() => {
      setNotifications(prev => prev.slice(1))
    }, 4000)
    return () => clearTimeout(timer)
  }, [notifications])

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const markNotificationsSeen = () => {
    setNotificationHistory((prev) => prev.map((item) => (
      item.unread ? { ...item, unread: false } : item
    )))
  }

  const clearNotificationHistory = () => {
    setNotificationHistory([])
  }

  return (
    <ErrorBoundary>
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      {/* ml-0 on mobile (bottom tab), ml-[72px] on md+ (left sidebar) */}
      <div className="flex-1 ml-0 md:ml-[72px] flex flex-col overflow-hidden">
        <TopBar
          recentNotifications={notificationHistory}
          unreadNotificationCount={unreadNotificationCount}
          onMarkNotificationsSeen={markNotificationsSeen}
          onClearNotifications={clearNotificationHistory}
          theme={theme}
          onToggleTheme={() => setTheme((current) => current === 'frost' ? 'midnight' : 'frost')}
        />

        {/* pb-20 on mobile for bottom tab bar clearance */}
        <main className="flex-1 overflow-y-auto px-3 md:px-6 lg:px-8 pb-20 md:pb-5">
          <Suspense
            fallback={(
              <div className="min-h-[240px] flex items-center justify-center">
                <div className="glass-strong rounded-2xl px-4 py-3 text-sm text-text-secondary">
                  Loading OpenClaw UI...
                </div>
              </div>
            )}
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/skills" element={<Skills />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/cron" element={<Cron />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>

        {/* Terminal toggle — hidden on mobile */}
        <button
          onClick={() => setTerminalOpen(prev => !prev)}
          className="hidden md:flex fixed bottom-4 right-4 z-40 w-10 h-10 rounded-xl glass-strong items-center justify-center text-text-secondary hover:text-accent transition-colors shadow-md"
          title="Toggle Terminal"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </button>
      </div>

      {terminalOpen && <TerminalConsole open={terminalOpen} onClose={() => setTerminalOpen(false)} />}
      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </div>
    </ErrorBoundary>
  )
}
