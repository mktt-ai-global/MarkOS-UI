import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react'

export interface Notification {
  id: string
  type: 'success' | 'warning' | 'info' | 'error'
  title: string
  message: string
}

const icons = {
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
  error: AlertTriangle,
}

const colors = {
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  error: 'text-danger',
}

interface Props {
  notifications: Notification[]
  onDismiss: (id: string) => void
}

export default function NotificationToast({ notifications, onDismiss }: Props) {
  if (notifications.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 w-80">
      {notifications.map((n) => {
        const Icon = icons[n.type]
        return (
          <div
            key={n.id}
            className="glass-strong rounded-xl p-3 flex items-start gap-2.5 animate-slide-in shadow-lg"
          >
            <Icon size={16} className={`${colors[n.type]} flex-shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-text-primary">{n.title}</div>
              <div className="text-[11px] text-text-secondary mt-0.5">{n.message}</div>
            </div>
            <button
              onClick={() => onDismiss(n.id)}
              className="w-5 h-5 rounded-md hover:bg-black/5 flex items-center justify-center flex-shrink-0"
            >
              <X size={12} className="text-text-tertiary" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
