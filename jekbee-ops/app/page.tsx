import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { Badge } from '@/components/ui/Badge'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'

async function getDashboardData() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/dashboard`, {
      cache: 'no-store',
    })
    if (!res.ok) throw new Error('Failed to fetch')
    return res.json()
  } catch {
    return null
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  if (!data) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          Failed to load dashboard data. Please check your database connection.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-600 bg-dark-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Dashboard</h1>
            <p className="text-xs text-white/40 mt-0.5 font-mono">
              {format(new Date(), 'EEEE d MMMM yyyy')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <SummaryCards
          activeClients={data.activeClients}
          activeEngagements={data.activeEngagements}
          activeFreelancers={data.activeFreelancers}
          totalOutcostThisMonth={data.totalOutcostThisMonth}
        />

        <div className="grid grid-cols-2 gap-6">
          {/* Freelancers Working This Week */}
          <div className="bg-dark-700 border border-dark-500 rounded-lg">
            <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Freelancers Working This Week</h2>
              <span className="text-xs text-white/30 font-mono">{data.workingThisWeek.length}</span>
            </div>
            {data.workingThisWeek.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/30 text-sm">No active work this week</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Freelancer</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Engagement</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workingThisWeek.map((fw: any) => (
                    <tr key={fw.id} className="border-b border-dark-600/50 hover:bg-dark-600/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/freelancers/${fw.freelancerId}`} className="text-sm text-white hover:text-amber-400 transition-colors">
                          {fw.name}
                        </Link>
                        <div>
                          <Badge label={fw.discipline} variant="service" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/engagements/${fw.engagementId}`} className="text-xs text-white/70 hover:text-amber-400 transition-colors line-clamp-1">
                          {fw.engagementTitle}
                        </Link>
                        <div className="text-xs text-white/30">{fw.clientName}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-white/50">
                        {fw.scheduledEnd ? format(parseISO(fw.scheduledEnd), 'd MMM') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Upcoming Deadlines */}
          <div className="bg-dark-700 border border-dark-500 rounded-lg">
            <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Upcoming Deadlines</h2>
              <span className="text-xs text-white/30 font-mono">next 30 days</span>
            </div>
            {data.upcomingDeadlines.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/30 text-sm">No deadlines in next 30 days</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Engagement</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Service</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {data.upcomingDeadlines.map((d: any) => (
                    <tr key={d.id} className="border-b border-dark-600/50 hover:bg-dark-600/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link href={`/engagements/${d.id}`} className="text-sm text-white hover:text-amber-400 transition-colors line-clamp-1">
                          {d.title}
                        </Link>
                        <div className="text-xs text-white/30">{d.clientName}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge label={d.service} variant="service" />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs font-mono text-white/70">
                          {d.endDate ? format(parseISO(d.endDate), 'd MMM') : '—'}
                        </div>
                        <div className={`text-xs font-mono ${d.daysUntil <= 7 ? 'text-red-400' : d.daysUntil <= 14 ? 'text-amber-400' : 'text-white/40'}`}>
                          {d.daysUntil}d
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Check-ins This Week */}
        <div className="bg-dark-700 border border-dark-500 rounded-lg">
          <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Check-ins This Week</h2>
            <Link href="/checkins" className="text-xs text-amber-400 hover:text-amber-300">
              View all
            </Link>
          </div>
          {data.checkInsThisWeek.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/30 text-sm">No check-ins this week</div>
          ) : (
            <div className="divide-y divide-dark-600/50">
              {data.checkInsThisWeek.map((ci: any) => (
                <Link
                  key={ci.id}
                  href={`/checkins/${ci.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-dark-600/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-dark-600 rounded-full flex items-center justify-center text-xs font-mono text-amber-400">
                      {ci.freelancerName.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm text-white">{ci.freelancerName}</p>
                      <p className="text-xs text-white/30">{ci.attendees || 'No attendees recorded'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-white/50">
                      {format(parseISO(ci.date), 'd MMM')}
                    </p>
                    <p className="text-xs text-white/30">
                      {ci.actionItemCount} action{ci.actionItemCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
