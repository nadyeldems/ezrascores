'use client'

import { useState } from 'react'
import { format, parseISO, isPast } from 'date-fns'

interface ActionItem {
  item: string
  owner: string
  due_date: string
  completed: boolean
}

interface ActionItemsListProps {
  items: ActionItem[]
  checkinId: string
  onUpdate?: (items: ActionItem[]) => void
  readonly?: boolean
}

export function ActionItemsList({ items, checkinId, onUpdate, readonly }: ActionItemsListProps) {
  const [localItems, setLocalItems] = useState(items)
  const [saving, setSaving] = useState<number | null>(null)

  const handleToggle = async (index: number) => {
    if (readonly) return
    const updated = localItems.map((item, i) =>
      i === index ? { ...item, completed: !item.completed } : item
    )
    setLocalItems(updated)
    setSaving(index)
    await fetch(`/api/checkins/${checkinId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_items: updated }),
    })
    setSaving(null)
    onUpdate?.(updated)
  }

  if (localItems.length === 0) {
    return (
      <div className="text-sm text-white/30 italic py-2">No action items</div>
    )
  }

  return (
    <div className="space-y-2">
      {localItems.map((item, i) => {
        const isOverdue = !item.completed && item.due_date && isPast(parseISO(item.due_date))
        return (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
              item.completed
                ? 'bg-dark-600/30 border-dark-600/30'
                : isOverdue
                ? 'bg-red-500/5 border-red-500/20'
                : 'bg-dark-600/50 border-dark-500/50'
            }`}
          >
            <button
              onClick={() => handleToggle(i)}
              disabled={readonly || saving === i}
              className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                item.completed
                  ? 'bg-green-400/30 border-green-400/60 text-green-400'
                  : 'border-dark-400 hover:border-amber-400/60'
              }`}
            >
              {item.completed && (
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${item.completed ? 'line-through text-white/30' : 'text-white/80'}`}>
                {item.item}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-white/30">{item.owner}</span>
                {item.due_date && (
                  <span
                    className={`text-xs font-mono ${
                      item.completed
                        ? 'text-white/20'
                        : isOverdue
                        ? 'text-red-400'
                        : 'text-white/40'
                    }`}
                  >
                    {format(parseISO(item.due_date), 'd MMM')}
                    {isOverdue && !item.completed && ' (overdue)'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
