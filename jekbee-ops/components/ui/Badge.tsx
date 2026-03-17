import { clsx } from 'clsx'
import { SERVICE_BG_CLASSES, STATUS_CLASSES } from '@/lib/types'

interface BadgeProps {
  label: string
  variant?: 'service' | 'status' | 'type' | 'default'
  className?: string
}

const TYPE_CLASSES: Record<string, string> = {
  Retainer: 'bg-indigo-400/20 text-indigo-400 border-indigo-400/30',
  Project: 'bg-cyan-400/20 text-cyan-400 border-cyan-400/30',
  AdCampaign: 'bg-orange-400/20 text-orange-400 border-orange-400/30',
}

export function Badge({ label, variant = 'default', className }: BadgeProps) {
  let variantClass = 'bg-dark-600 text-white/60 border-dark-400'

  if (variant === 'service') {
    variantClass = SERVICE_BG_CLASSES[label] || variantClass
  } else if (variant === 'status') {
    variantClass = STATUS_CLASSES[label] || variantClass
  } else if (variant === 'type') {
    variantClass = TYPE_CLASSES[label] || variantClass
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border',
        variantClass,
        className
      )}
    >
      {label}
    </span>
  )
}
