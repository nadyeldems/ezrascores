'use client'

import { useMemo } from 'react'
import { startOfWeek, addDays, format, isWithinInterval, parseISO } from 'date-fns'
import Link from 'next/link'
import { SERVICE_COLORS } from '@/lib/types'

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

interface WeeklyGridProps {
  weekStart: Date
  freelancerEngagements: FreelancerEngagement[]
  freelancers: { id: string; name: string; discipline: string }[]
}

export function WeeklyGrid({ weekStart, freelancerEngagements, freelancers }: WeeklyGridProps) {
  const weekDays = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const getCellEngagements = (freelancerId: string, day: Date) => {
    return freelancerEngagements.filter((fe) => {
      if (fe.freelancer_id !== freelancerId) return false
      if (!fe.scheduled_start || !fe.scheduled_end) return false
      const start = parseISO(fe.scheduled_start)
      const end = parseISO(fe.scheduled_end)
      return isWithinInterval(day, { start, end })
    })
  }

  const serviceColor = (service: string) => {
    return SERVICE_COLORS[service as keyof typeof SERVICE_COLORS] || '#888'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed">
        <thead>
          <tr className="border-b border-dark-500">
            <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase w-36">
              Freelancer
            </th>
            {weekDays.map((day) => (
              <th
                key={day.toISOString()}
                className="px-2 py-3 text-center text-xs font-mono"
              >
                <span className="text-white/30 uppercase">{format(day, 'EEE')}</span>
                <br />
                <span className="text-white/60">{format(day, 'd MMM')}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {freelancers.map((freelancer) => (
            <tr key={freelancer.id} className="border-b border-dark-600/50">
              <td className="px-4 py-2">
                <Link
                  href={`/freelancers/${freelancer.id}`}
                  className="text-sm text-white/70 hover:text-amber-400 transition-colors"
                >
                  {freelancer.name.split(' ')[0]}
                  <br />
                  <span className="text-xs text-white/30">{freelancer.discipline}</span>
                </Link>
              </td>
              {weekDays.map((day) => {
                const cellEngagements = getCellEngagements(freelancer.id, day)
                return (
                  <td
                    key={day.toISOString()}
                    className="px-1 py-1 align-top"
                    style={{ minWidth: '120px' }}
                  >
                    {cellEngagements.length > 0 ? (
                      <div className="space-y-1">
                        {cellEngagements.map((fe) => (
                          <Link
                            key={fe.id}
                            href={`/engagements/${fe.engagement_id}`}
                            className="block px-2 py-1.5 rounded text-[10px] leading-tight hover:opacity-90 transition-opacity"
                            style={{
                              backgroundColor: `${serviceColor(fe.engagement.service)}22`,
                              borderLeft: `2px solid ${serviceColor(fe.engagement.service)}`,
                              color: serviceColor(fe.engagement.service),
                            }}
                            title={`${fe.engagement.title} — ${fe.engagement.client.name}`}
                          >
                            <span className="font-mono font-medium truncate block">
                              {fe.engagement.client.name}
                            </span>
                            <span className="text-white/40 truncate block">
                              {fe.engagement.service}
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="h-10 rounded bg-dark-600/20" />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}

          {freelancers.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-white/30 text-sm">
                No active freelancers
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
