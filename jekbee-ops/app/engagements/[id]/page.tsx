'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { OutcostPanel } from '@/components/engagements/OutcostPanel'
import { FreelancerTeamSection } from '@/components/engagements/FreelancerTeamSection'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'

interface EngagementDetail {
  id: string
  title: string
  type: string
  service: string
  status: string
  start_date: string | null
  end_date: string | null
  brief: string | null
  jekbee_margin_percent: number
  client: { id: string; name: string; account_manager: string }
  freelancers: {
    id: string
    freelancer_id: string
    days_allocated: number
    scheduled_start: string | null
    scheduled_end: string | null
    freelancer_brief: string | null
    status: string
    freelancer: {
      id: string
      name: string
      discipline: string
      day_rate: number
    }
  }[]
}

export default function EngagementDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [engagement, setEngagement] = useState<EngagementDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefValue, setBriefValue] = useState('')
  const [savingBrief, setSavingBrief] = useState(false)

  const fetchEngagement = useCallback(async () => {
    const res = await fetch(`/api/engagements/${id}`)
    if (res.ok) {
      const data = await res.json()
      setEngagement(data)
      setBriefValue(data.brief || '')
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchEngagement()
  }, [fetchEngagement])

  const handleSaveBrief = async () => {
    setSavingBrief(true)
    await fetch(`/api/engagements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: briefValue }),
    })
    setSavingBrief(false)
    setEditingBrief(false)
    if (engagement) {
      setEngagement({ ...engagement, brief: briefValue })
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-white/30 text-sm font-mono animate-pulse">Loading...</div>
      </div>
    )
  }

  if (!engagement) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          Engagement not found
        </div>
      </div>
    )
  }

  const outcostFreelancers = engagement.freelancers.map((fe) => ({
    id: fe.id,
    name: fe.freelancer.name,
    discipline: fe.freelancer.discipline,
    daysAllocated: Number(fe.days_allocated),
    dayRate: Number(fe.freelancer.day_rate),
  }))

  const teamMembers = engagement.freelancers.map((fe) => ({
    id: fe.id,
    freelancerId: fe.freelancer_id,
    name: fe.freelancer.name,
    discipline: fe.freelancer.discipline,
    daysAllocated: Number(fe.days_allocated),
    scheduledStart: fe.scheduled_start,
    scheduledEnd: fe.scheduled_end,
    status: fe.status,
    freelancerBrief: fe.freelancer_brief,
  }))

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-600 bg-dark-800">
        <div className="flex items-center gap-2 text-xs text-white/30 mb-1">
          <Link href="/engagements" className="hover:text-white/60">Engagements</Link>
          <span>/</span>
          <Link href={`/clients/${engagement.client.id}`} className="hover:text-white/60">
            {engagement.client.name}
          </Link>
          <span>/</span>
          <span className="text-white/60 truncate max-w-xs">{engagement.title}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-base font-semibold text-white">{engagement.title}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-white/40">{engagement.client.name}</span>
              <span className="text-white/20 text-xs">·</span>
              <Badge label={engagement.type} variant="type" />
              <Badge label={engagement.service} variant="service" />
              <Badge label={engagement.status} variant="status" />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-mono text-white/40">
              {engagement.start_date
                ? format(parseISO(engagement.start_date), 'd MMM yy')
                : 'TBC'}
              {' → '}
              {engagement.end_date
                ? format(parseISO(engagement.end_date), 'd MMM yy')
                : 'TBC'}
            </div>
            <div className="text-xs text-white/30 mt-0.5">
              AM: {engagement.client.account_manager}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Brief */}
        <div className="bg-dark-700 border border-dark-500 rounded-lg">
          <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Brief</h2>
            {!editingBrief && (
              <Button variant="ghost" size="sm" onClick={() => setEditingBrief(true)}>
                Edit
              </Button>
            )}
          </div>
          <div className="p-4">
            {editingBrief ? (
              <div className="space-y-3">
                <textarea
                  value={briefValue}
                  onChange={(e) => setBriefValue(e.target.value)}
                  rows={8}
                  className="w-full bg-dark-600 border border-dark-400 text-white text-sm px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400/60 resize-none"
                  placeholder="Engagement brief..."
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingBrief(false)
                      setBriefValue(engagement.brief || '')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveBrief}
                    disabled={savingBrief}
                  >
                    {savingBrief ? 'Saving...' : 'Save Brief'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
                {engagement.brief || (
                  <span className="text-white/30 italic">No brief added yet. Click Edit to add one.</span>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Freelancer Team */}
        <FreelancerTeamSection
          engagementId={engagement.id}
          initialTeam={teamMembers}
          onTeamUpdate={fetchEngagement}
        />

        {/* Outcost Panel */}
        <OutcostPanel
          freelancers={outcostFreelancers}
          initialMarginPercent={Number(engagement.jekbee_margin_percent)}
          engagementId={engagement.id}
          engagementTitle={engagement.title}
          clientName={engagement.client.name}
        />
      </div>
    </div>
  )
}
