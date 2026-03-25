import type { ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  title?: string
  subtitle?: string
  action?: ReactNode
  className?: string
  variant?: 'default' | 'strong' | 'subtle'
  padding?: 'sm' | 'md' | 'lg'
}

const variants = {
  default: 'glass',
  strong: 'glass-strong',
  subtle: 'glass-subtle',
}

const paddings = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

export default function GlassCard({
  children,
  title,
  subtitle,
  action,
  className = '',
  variant = 'default',
  padding = 'md',
}: GlassCardProps) {
  return (
    <div className={`${variants[variant]} ${paddings[padding]} animate-fade-in ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            )}
            {subtitle && (
              <p className="text-xs text-text-tertiary mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
