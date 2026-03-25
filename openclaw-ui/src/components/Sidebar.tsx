import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Bot,
  Puzzle,
  MessageCircle,
  CalendarClock,
  MonitorSmartphone,
  ShieldCheck,
  Settings,
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/skills', icon: Puzzle, label: 'Skills' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/cron', icon: CalendarClock, label: 'Cron' },
  { to: '/devices', icon: MonitorSmartphone, label: 'Devices' },
  { to: '/approvals', icon: ShieldCheck, label: 'Approvals' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Sidebar() {
  return (
    <>
      {/* Desktop: Left sidebar */}
      <aside className="glass-sidebar fixed left-0 top-0 bottom-0 z-50 w-[72px] hidden md:flex flex-col items-center py-6 gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-light)] flex items-center justify-center mb-6 shadow-md">
          <span className="text-white font-bold text-sm">OC</span>
        </div>
        <nav role="navigation" aria-label="Main navigation" className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative w-11 h-11 flex items-center justify-center rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-[var(--color-glass-bg)] shadow-sm text-accent'
                    : 'text-text-secondary hover:bg-[var(--color-glass-hover)] hover:text-text-primary'
                }`
              }
              title={label}
              aria-label={label}
            >
              <Icon size={20} strokeWidth={1.8} />
              <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg bg-[#1d1d1f]/90 text-white text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50">
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Mobile: Bottom tab bar */}
      <nav role="navigation" aria-label="Mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-[var(--color-glass-border)] flex items-center gap-1 overflow-x-auto px-2 py-1.5 safe-bottom">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all flex-shrink-0 min-w-[68px] ${
                isActive
                  ? 'text-accent'
                  : 'text-text-secondary'
              }`
            }
            aria-label={label}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span className="text-[9px] font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
