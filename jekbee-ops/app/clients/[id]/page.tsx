import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'
import { format } from 'date-fns'
import type { EngagementType } from '@prisma/client'

async function getClient(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      engagements: {
        include: {
          freelancers: {
            include: { freelancer: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

const TYPE_LABELS: Record<EngagementType, string> = {
  Retainer: 'Retainers',
  Project: 'Projects',
  AdCampaign: 'Ad Campaigns',
}

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const client = await getClient(params.id)

  if (!client) notFound()

  const engagementsByType: Record<EngagementType, typeof client.engagements> = {
    Retainer: client.engagements.filter((e) => e.type === 'Retainer'),
    Project: client.engagements.filter((e) => e.type === 'Project'),
    AdCampaign: client.engagements.filter((e) => e.type === 'AdCampaign'),
  }

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-600 bg-dark-800">
        <div className="flex items-center gap-2 text-xs text-white/30 mb-1">
          <Link href="/clients" className="hover:text-white/60">Clients</Link>
          <span>/</span>
          <span className="text-white/60">{client.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-white">{client.name}</h1>
            <Badge label={client.status} variant="status" />
          </div>
          <div className="text-xs text-white/40">
            AM: <span className="text-white/60">{client.account_manager}</span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Info cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-dark-700 border border-dark-500 rounded-lg p-4">
            <p className="text-xs text-white/30 font-mono uppercase mb-1">Account Manager</p>
            <p className="text-sm text-white">{client.account_manager}</p>
          </div>
          <div className="bg-dark-700 border border-dark-500 rounded-lg p-4">
            <p className="text-xs text-white/30 font-mono uppercase mb-1">Total Engagements</p>
            <p className="text-2xl font-mono font-bold text-white">{client.engagements.length}</p>
          </div>
          <div className="bg-dark-700 border border-dark-500 rounded-lg p-4">
            <p className="text-xs text-white/30 font-mono uppercase mb-1">Active Engagements</p>
            <p className="text-2xl font-mono font-bold text-green-400">
              {client.engagements.filter((e) => e.status === 'Active').length}
            </p>
          </div>
        </div>

        {/* Engagements grouped by type */}
        {(Object.keys(engagementsByType) as EngagementType[]).map((type) => {
          const engagements = engagementsByType[type]
          if (engagements.length === 0) return null

          return (
            <div key={type} className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">{TYPE_LABELS[type]}</h2>
                <span className="text-xs font-mono text-white/30">{engagements.length}</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-600">
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Title</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Service</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Status</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Dates</th>
                    <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Team</th>
                    <th className="px-4 py-2 text-right text-xs text-white/30 font-mono uppercase"></th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map((eng) => (
                    <tr key={eng.id} className="border-b border-dark-600/50 hover:bg-dark-600/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/engagements/${eng.id}`}
                          className="text-sm text-white hover:text-amber-400 transition-colors"
                        >
                          {eng.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={eng.service} variant="service" />
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={eng.status} variant="status" />
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-white/50">
                        {eng.start_date ? format(eng.start_date, 'd MMM yy') : '—'}
                        {' → '}
                        {eng.end_date ? format(eng.end_date, 'd MMM yy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-white/50">
                        {eng.freelancers.length > 0
                          ? eng.freelancers.map((fe) => fe.freelancer.name.split(' ')[0]).join(', ')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/engagements/${eng.id}`}
                          className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}

        {client.engagements.length === 0 && (
          <div className="bg-dark-700 border border-dark-500 rounded-lg p-12 text-center text-white/30 text-sm">
            No engagements for this client yet
          </div>
        )}
      </div>
    </div>
  )
}
