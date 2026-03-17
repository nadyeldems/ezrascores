'use client'

import { useState, useEffect } from 'react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { format, parseISO, isPast } from 'date-fns'

interface CheckIn {
  id: string
  date: string
  attendees: string | null
  action_items: any[]
  freelancer: { id: string; name: string; discipline: string }
}

type TabType = 'checkins' | 'actions'

export default function CheckInsPage() {
  const [checkins, setCheckins] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabType>('checkins')
  const [filterOwner, setFilterOwner] = useState('')

  useEffect(() => {
    fetch('/api/checkins')
      .then((r) => r.json())
      .then((data) => { setCheckins(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Flatten all action items across all check-ins
  const allActionItems = checkins.flatMap((ci) => {
    const items = Array.isArray(ci.action_items) ? ci.action_items : []
    return items.map((item: any, index: number) => ({
      ...item,
      checkinId: ci.id,
      checkinDate: ci.date,
      freelancerName: ci.freelancer.name,
      freelancerId: ci.freelancer.id,
      index,
    }))
  })

  const openActionItems = allActionItems.filter((a) => !a.completed)

  const filteredActions = filterOwner
    ? openActionItems.filter((a) => a.owner.toLowerCase().includes(filterOwner.toLowerCase()))
    : openActionItems

  const owners = [...new Set(allActionItems.map((a) => a.owner))].sort()

  return (
    <div>
      <TopBar
        title="Check-ins"
        subtitle={`${checkins.length} total`}
        actions={
          <Link href="/checkins/new">
            <Button variant="primary" size="sm">+ New Check-in</Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="px-6 border-b border-dark-600 bg-dark-800 flex gap-1">
        {(['checkins', 'actions'] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm transition-colors border-b-2 capitalize ${
              tab === t
                ? 'text-amber-400 border-amber-400'
                : 'text-white/40 border-transparent hover:text-white/60'
            }`}
          >
            {t === 'checkins' ? 'Check-ins' : `Action Items (${openActionItems.length} open)`}
          </button>
        ))}
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-white/30 text-sm font-mono animate-pulse">Loading...</div>
        ) : tab === 'checkins' ? (
          <div className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-500">
                  <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase">Freelancer</th>
                  <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase">Attendees</th>
                  <th className="px-4 py-3 text-right text-xs text-white/30 font-mono uppercase">Actions</th>
                  <th className="px-4 py-3 text-right text-xs text-white/30 font-mono uppercase"></th>
                </tr>
              </thead>
              <tbody>
                {checkins.map((ci) => {
                  const items = Array.isArray(ci.action_items) ? ci.action_items : []
                  const openCount = items.filter((a: any) => !a.completed).length
                  return (
                    <tr
                      key={ci.id}
                      className="border-b border-dark-600/50 hover:bg-dark-600/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs font-mono text-white/70">
                        {format(parseISO(ci.date), 'EEE d MMM yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/freelancers/${ci.freelancer.id}`}
                          className="text-sm text-white hover:text-amber-400 transition-colors"
                        >
                          {ci.freelancer.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-white/40">{ci.attendees || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs font-mono text-white/30">{items.length} total</span>
                          {openCount > 0 && (
                            <span className="text-xs font-mono text-amber-400">{openCount} open</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/checkins/${ci.id}`}
                          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {checkins.length === 0 && (
              <div className="px-4 py-12 text-center text-white/30 text-sm">
                No check-ins yet
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Filter */}
            <div className="mb-4 flex items-center gap-3">
              <select
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
                className="bg-dark-600 border border-dark-400 text-white/70 text-xs px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-400/60"
              >
                <option value="">All Owners</option>
                {owners.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
              {filterOwner && (
                <button
                  onClick={() => setFilterOwner('')}
                  className="text-xs text-amber-400 hover:text-amber-300"
                >
                  Clear
                </button>
              )}
              <span className="text-xs text-white/30 font-mono">
                {filteredActions.length} open item{filteredActions.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2">
              {filteredActions.map((action, i) => {
                const isOverdue = action.due_date && isPast(parseISO(action.due_date))
                return (
                  <div
                    key={`${action.checkinId}-${action.index}`}
                    className={`flex items-start gap-3 p-3 rounded-md border ${
                      isOverdue ? 'bg-red-500/5 border-red-500/20' : 'bg-dark-700 border-dark-500'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80">{action.item}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-white/40">{action.owner}</span>
                        {action.due_date && (
                          <span className={`text-xs font-mono ${isOverdue ? 'text-red-400' : 'text-white/40'}`}>
                            Due {format(parseISO(action.due_date), 'd MMM')}
                            {isOverdue && ' (overdue)'}
                          </span>
                        )}
                        <Link
                          href={`/freelancers/${action.freelancerId}`}
                          className="text-xs text-white/30 hover:text-amber-400 transition-colors"
                        >
                          {action.freelancerName}
                        </Link>
                        <span className="text-xs text-white/20">·</span>
                        <Link
                          href={`/checkins/${action.checkinId}`}
                          className="text-xs text-white/20 hover:text-white/50 transition-colors"
                        >
                          Check-in {format(parseISO(action.checkinDate), 'd MMM')}
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
              {filteredActions.length === 0 && (
                <div className="bg-dark-700 border border-dark-500 rounded-lg p-12 text-center text-white/30 text-sm">
                  No open action items
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
