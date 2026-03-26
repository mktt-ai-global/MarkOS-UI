import { useEffect, useRef, useState } from 'react'
import { Search, Bell, Sun, Moon, Cpu, Wifi, Trash2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useConnectionStatus, useGatewayData } from '../hooks/useOpenClaw'
import { normalizePresence } from '../lib/openclaw-adapters'
import { mockSystemStatus } from '../lib/mock-data'
import type { Notification } from './NotificationToast'

const statusColors: Record<string, string> = {
  connected: 'bg-success',
  connecting: 'bg-warning',
  disconnected: 'bg-text-tertiary',
  error: 'bg-danger',
}

const statusLabels: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting...',
  disconnected: 'Disconnected',
  error: 'Error',
}

const pageNames: Record<string, string> = {
  '/': 'Dashboard',
  '/agents': 'Agents',
  '/skills': 'Skills',
  '/chat': 'Chat',
  '/cron': 'Scheduled Tasks',
  '/devices': 'Devices',
  '/approvals': 'Approvals',
  '/settings': 'Settings',
}

const quickJumpRoutes = Object.entries(pageNames).map(([path, label]) => ({
  path,
  label,
  searchText: `${path} ${label}`.toLowerCase(),
}))

interface RecentNotification extends Notification {
  createdAt: string
  unread: boolean
}

interface Props {
  recentNotifications: RecentNotification[]
  unreadNotificationCount: number
  onMarkNotificationsSeen: () => void
  onClearNotifications: () => void
  theme: 'frost' | 'midnight'
  onToggleTheme: () => void
}

const notificationTypeStyles: Record<Notification['type'], string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  error: 'bg-danger/10 text-danger',
}

export default function TopBar({
  recentNotifications,
  unreadNotificationCount,
  onMarkNotificationsSeen,
  onClearNotifications,
  theme,
  onToggleTheme,
}: Props) {
  const connectionStatus = useConnectionStatus()
  const location = useLocation()
  const navigate = useNavigate()
  const [quickJumpQuery, setQuickJumpQuery] = useState('')
  const [searchNotice, setSearchNotice] = useState<string | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDropdownRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const pageName = pageNames[location.pathname] || (location.pathname === '/' ? 'Dashboard' : 'Not Found')
  const { data: presenceRaw } = useGatewayData<unknown>('system-presence', {}, mockSystemStatus, 10000)
  const presence = normalizePresence(presenceRaw, [], [], mockSystemStatus)

  const focusSearch = () => {
    setMobileSearchOpen(true)
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }

  const handleQuickJump = () => {
    const normalized = quickJumpQuery.trim().toLowerCase()
    if (!normalized) {
      focusSearch()
      return
    }

    const exactMatch = quickJumpRoutes.find((route) => (
      route.label.toLowerCase() === normalized || route.path === normalized
    ))
    const fuzzyMatch = quickJumpRoutes.find((route) => route.searchText.includes(normalized))
    const nextRoute = exactMatch || fuzzyMatch

    if (!nextRoute) {
      setSearchNotice(`No page matched "${quickJumpQuery.trim()}".`)
      return
    }

    navigate(nextRoute.path)
    setQuickJumpQuery('')
    setMobileSearchOpen(false)
    setSearchNotice(`Jumped to ${nextRoute.label}.`)
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        focusSearch()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  useEffect(() => {
    if (!searchNotice) return

    const timer = window.setTimeout(() => setSearchNotice(null), 2400)
    return () => window.clearTimeout(timer)
  }, [searchNotice])

  useEffect(() => {
    if (!notificationsOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [notificationsOpen])

  useEffect(() => {
    if (!mobileSearchOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!searchDropdownRef.current?.contains(event.target as Node)) {
        setMobileSearchOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [mobileSearchOpen])

  return (
    <header className="glass-strong sticky top-0 z-40 h-12 md:h-14 flex items-center justify-between px-3 md:px-5 rounded-2xl mx-1 mt-1 mb-2 md:mb-3">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-1.5 md:gap-2 text-sm min-w-0">
        <span className="font-semibold text-text-primary tracking-tight text-sm md:text-base">openclaw</span>
        <span className="text-text-tertiary">/</span>
        <span className="text-text-secondary text-xs md:text-sm">{pageName}</span>
      </div>

      {/* Center: System Status Pills — hidden on mobile */}
      <div className="hidden lg:flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-subtle text-xs text-text-secondary">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColors[connectionStatus]} pulse-dot`} />
          <span>{statusLabels[connectionStatus]}</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-subtle text-xs text-text-secondary">
          <Cpu size={12} />
          <span>CPU: {presence.cpu}%</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-subtle text-xs text-text-secondary">
          <Wifi size={12} />
          <span>{presence.networkLatency}ms</span>
        </div>
      </div>

      {/* Mobile: compact status dot */}
      <div className="flex lg:hidden items-center gap-1.5 px-2 py-1 rounded-full glass-subtle text-[10px] text-text-secondary">
        <span className={`w-1.5 h-1.5 rounded-full ${statusColors[connectionStatus]} pulse-dot`} />
        <span>{statusLabels[connectionStatus]}</span>
      </div>

      {/* Right: Search + Actions */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {searchNotice && (
          <div className="hidden xl:block px-2.5 py-1 rounded-xl bg-info/10 text-[10px] text-info">
            {searchNotice}
          </div>
        )}
        {/* Full search — desktop only */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl glass-input w-52">
          <button
            onClick={handleQuickJump}
            className="text-text-tertiary hover:text-accent transition-colors"
            title="Quick jump to a page"
          >
            <Search size={14} />
          </button>
          <input
            ref={searchInputRef}
            type="text"
            value={quickJumpQuery}
            onChange={(event) => setQuickJumpQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleQuickJump()
              }
            }}
            placeholder="Jump to a page..."
            className="bg-transparent text-sm text-text-primary placeholder-text-tertiary outline-none w-full"
          />
          <kbd className="text-[10px] text-text-tertiary bg-[var(--color-glass-subtle)] px-1.5 py-0.5 rounded">⌘K</kbd>
        </div>
        {/* Mobile search icon */}
        <button
          onClick={() => {
            if (mobileSearchOpen) {
              handleQuickJump()
              return
            }
            focusSearch()
          }}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[var(--color-glass-hover)] text-text-secondary transition-colors"
          aria-label="Quick jump"
          title="Quick jump"
        >
          <Search size={16} />
        </button>
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => {
              const nextOpen = !notificationsOpen
              setNotificationsOpen(nextOpen)
              if (nextOpen) {
                onMarkNotificationsSeen()
              }
            }}
            className="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-accent hover:bg-[var(--color-glass-hover)] transition-colors relative"
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={16} className="md:w-[18px] md:h-[18px]" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-danger text-white text-[9px] leading-4 text-center">
                {Math.min(unreadNotificationCount, 9)}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-24px)] glass-strong rounded-2xl p-3 shadow-lg space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-text-primary">Notifications</div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">
                    Recent gateway and UI notices in this browser session.
                  </div>
                </div>
                <button
                  onClick={onClearNotifications}
                  className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] text-text-secondary hover:text-accent transition-colors"
                  title="Clear notifications"
                >
                  <Trash2 size={11} />
                  Clear
                </button>
              </div>

              {recentNotifications.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {recentNotifications.map((item) => (
                    <div key={item.id} className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${notificationTypeStyles[item.type]}`}>
                          {item.type}
                        </span>
                        <span className="text-[10px] text-text-tertiary ml-auto">{item.createdAt}</span>
                      </div>
                      <div className="text-xs font-medium text-text-primary mt-1">{item.title}</div>
                      <div className="text-[11px] text-text-secondary mt-1">{item.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-[var(--color-glass-subtle)] px-3 py-4 text-xs text-text-tertiary text-center">
                  No notifications yet.
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onToggleTheme}
          className="hidden sm:flex w-9 h-9 items-center justify-center rounded-xl text-text-secondary hover:text-accent hover:bg-[var(--color-glass-hover)] transition-colors"
          title={theme === 'frost' ? 'Switch to midnight theme' : 'Switch to frost theme'}
          aria-label={theme === 'frost' ? 'Switch to midnight theme' : 'Switch to frost theme'}
        >
          {theme === 'frost' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-light)] flex items-center justify-center ml-0.5 md:ml-1">
          <span className="text-white text-[10px] md:text-xs font-semibold">SC</span>
        </div>
      </div>

      {mobileSearchOpen && (
        <div ref={searchDropdownRef} className="md:hidden absolute left-3 right-3 top-full mt-2 glass-strong rounded-2xl px-3 py-2 flex items-center gap-2">
          <Search size={14} className="text-text-tertiary" />
          <input
            ref={searchInputRef}
            type="text"
            value={quickJumpQuery}
            onChange={(event) => setQuickJumpQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleQuickJump()
              }
            }}
            placeholder="Jump to Dashboard, Chat..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-tertiary outline-none"
          />
        </div>
      )}
    </header>
  )
}
