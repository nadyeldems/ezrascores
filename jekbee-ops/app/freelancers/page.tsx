import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/Badge'
import { TopBar } from '@/components/layout/TopBar'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

async function getFreelancers() {
  return prisma.freelancer.findMany({
    include: {
      engagements: {
        where: { status: { in: ['Briefed', 'InProgress'] } },
        include: { engagement: true },
      },
    },
    orderBy: { name: 'asc' },
  })
}

export default async function FreelancersPage() {
  const freelancers = await getFreelancers()

  return (
    <div>
      <TopBar
        title="Freelancers"
        subtitle={`${freelancers.length} total`}
        actions={
          <Link href="/freelancers/new">
            <Button variant="primary" size="sm">+ New Freelancer</Button>
          </Link>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-3 gap-4">
          {freelancers.map((f) => {
            const activeCount = f.engagements.length
            return (
              <Link
                key={f.id}
                href={`/freelancers/${f.id}`}
                className="bg-dark-700 border border-dark-500 rounded-lg p-4 hover:border-dark-400 hover:bg-dark-600/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-dark-600 border border-dark-400 rounded-full flex items-center justify-center text-xs font-mono text-amber-400 font-bold group-hover:border-amber-400/30 transition-colors">
                      {f.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white group-hover:text-amber-400 transition-colors">
                        {f.name}
                      </p>
                      <p className="text-xs text-white/30">{f.email}</p>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-1.5 ${f.active ? 'bg-green-400' : 'bg-dark-400'}`} />
                </div>

                <div className="flex items-center justify-between">
                  <Badge label={f.discipline} variant="service" />
                  <span className="text-sm font-mono text-amber-400 font-medium">
                    £{Number(f.day_rate).toLocaleString('en-GB')}/d
                  </span>
                </div>

                {f.availability_notes && (
                  <p className="mt-2.5 text-xs text-white/30 line-clamp-2">
                    {f.availability_notes}
                  </p>
                )}

                <div className="mt-3 pt-3 border-t border-dark-600 flex items-center justify-between">
                  <span className="text-xs text-white/30">
                    {activeCount > 0
                      ? `${activeCount} active engagement${activeCount !== 1 ? 's' : ''}`
                      : 'No active engagements'}
                  </span>
                  <span className="text-xs text-amber-400/60 group-hover:text-amber-400 transition-colors">
                    View →
                  </span>
                </div>
              </Link>
            )
          })}
        </div>

        {freelancers.length === 0 && (
          <div className="bg-dark-700 border border-dark-500 rounded-lg p-12 text-center text-white/30 text-sm">
            No freelancers yet
          </div>
        )}
      </div>
    </div>
  )
}
