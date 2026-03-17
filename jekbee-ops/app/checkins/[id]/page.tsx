'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { ActionItemsList } from '@/components/checkins/ActionItemsList'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'

interface CheckInDetail {
  id: string
  date: string
  attendees: string | null
  notes: string | null
  action_items: any[]
  freelancer: { id: string; name: string; discipline: string }
}

export default function CheckInDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [checkin, setCheckin] = useState<CheckInDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCheckin = useCallback(async () => {
    const res = await fetch(`/api/checkins/${id}`)
    if (res.ok) {
      const data = await res.json()
      // Ensure action_items is array
      data.action_items = Array.isArray(data.action_items) ? data.action_items : []
      setCheckin(data)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchCheckin()
  }, [fetchCheckin])

  const handleItemsUpdate = (items: any[]) => {
    if (checkin) setCheckin({ ...checkin, action_items: items })
  }

  if (loading) {
    return <div className="p-6 text-white/30 text-sm font-mono animate-pulse">Loading...</div>
  }

  if (!checkin) {
    return <div className="p-6 text-red-400 text-sm">Check-in not found</div>
  }

  const openItems = checkin.action_items.filter((a: any) => !a.completed)
  const completedItems = checkin.action_items.filter((a: any) => a.completed)

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-600 bg-dark-800">
        <div className="flex items-center gap-2 text-xs text-white/30 mb-1">
          <Link href="/checkins" className="hover:text-white/60">Check-ins</Link>
          <span>/</span>
          <span className="text-white/60">
            {format(parseISO(checkin.date), 'EEE d MMM yyyy')}
          </span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">
              Check-in — {format(parseISO(checkin.date), 'EEEE d MMMM yyyy')}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Link
                href={`/freelancers/${checkin.freelancer.id}`}
                className="text-sm text-white/60 hover:text-amber-400 transition-colors"
              >
                {checkin.freelancer.name}
              </Link>
              <Badge label={checkin.freelancer.discipline} variant="service" />
            </div>
          </div>
          <div className="text-right text-xs text-white/30">
            <p>Attendees</p>
            <p className="text-white/60">{checkin.attendees || '—'}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Notes */}
        <div className="bg-dark-700 border border-dark-500 rounded-lg p-4">
          <h2 className="text-xs font-mono text-white/30 uppercase mb-3">Notes</h2>
          {checkin.notes ? (
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{checkin.notes}</p>
          ) : (
            <p className="text-sm text-white/30 italic">No notes recorded</p>
          )}
        </div>

        {/* Action Items */}
        <div className="bg-dark-700 border border-dark-500 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono text-white/30 uppercase">Action Items</h2>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-amber-400">{openItems.length} open</span>
              <span className="text-green-400/60">{completedItems.length} done</span>
            </div>
          </div>
          <ActionItemsList
            items={checkin.action_items}
            checkinId={checkin.id}
            onUpdate={handleItemsUpdate}
          />
        </div>
      </div>
    </div>
  )
}
