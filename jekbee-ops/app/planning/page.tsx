'use client'

import { useState, useEffect } from 'react'
import { startOfWeek, addWeeks, subWeeks, addDays, format, endOfWeek } from 'date-fns'
import { WeeklyGrid } from '@/components/planning/WeeklyGrid'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'

interface FreelancerEngagement {
  id: string
  freelancer_id: string
  engagement_id: string
  scheduled_start: string | null
  scheduled_end: string | null
  status: string
  freelancer: { id: string; name: string; discipline: string }
  engagement: {
    id: string
    title: string
    service: string
    client: { name: string }
  }
}

interface Freelancer {
  id: string
  name: string
  discipline: string
}

export default function PlanningPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [freelancerEngagements, setFreelancerEngagements] = useState<FreelancerEngagement[]>([])
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

    Promise.all([
      fetch('/api/freelancers?active=true').then((r) => r.json()),
      fetch('/api/freelancer-engagements').then((r) => r.json()),
    ]).then(([fls, fes]) => {
      setFreelancers(
        fls.map((f: any) => ({
          id: f.id,
          name: f.name,
          discipline: f.discipline,
        }))
      )

      // Filter to those that overlap with current week
      const weekEngagements = fes.filter((fe: any) => {
        if (!fe.scheduled_start || !fe.scheduled_end) return false
        const start = new Date(fe.scheduled_start)
        const end = new Date(fe.scheduled_end)
        return start <= weekEnd && end >= weekStart
      })

      setFreelancerEngagements(weekEngagements)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [weekStart])

  const goToPrevWeek = () => setWeekStart((w) => subWeeks(w, 1))
  const goToNextWeek = () => setWeekStart((w) => addWeeks(w, 1))
  const goToCurrentWeek = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))

  const weekEnd = addDays(weekStart, 4)
  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`

  return (
    <div>
      <TopBar
        title="Weekly Planning"
        subtitle={weekLabel}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goToPrevWeek}>
              ← Prev
            </Button>
            <Button variant="secondary" size="sm" onClick={goToCurrentWeek}>
              This Week
            </Button>
            <Button variant="ghost" size="sm" onClick={goToNextWeek}>
              Next →
            </Button>
          </div>
        }
      />

      <div className="p-6">
        {loading ? (
          <div className="text-white/30 text-sm font-mono animate-pulse">Loading...</div>
        ) : (
          <div className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
            {/* Week navigation header */}
            <div className="px-4 py-3 border-b border-dark-600 flex items-center gap-4">
              <span className="text-xs font-mono text-white/40 uppercase">Week of</span>
              <span className="text-sm font-mono text-amber-400">{weekLabel}</span>
              <span className="text-xs text-white/20 font-mono">
                {freelancers.filter((f) =>
                  freelancerEngagements.some((fe) => fe.freelancer_id === f.id)
                ).length}{' '}
                of {freelancers.length} freelancers active
              </span>
            </div>

            <WeeklyGrid
              weekStart={weekStart}
              freelancerEngagements={freelancerEngagements}
              freelancers={freelancers}
            />
          </div>
        )}
      </div>
    </div>
  )
}
