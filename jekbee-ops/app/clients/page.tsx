import { Badge } from '@/components/ui/Badge'
import { TopBar } from '@/components/layout/TopBar'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'

async function getClients() {
  return prisma.client.findMany({
    include: {
      engagements: {
        include: { freelancers: true },
      },
    },
    orderBy: { name: 'asc' },
  })
}

export default async function ClientsPage() {
  const clients = await getClients()

  return (
    <div>
      <TopBar
        title="Clients"
        subtitle={`${clients.length} total`}
      />

      <div className="p-6">
        <div className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-500">
                <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase tracking-wide">Client</th>
                <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase tracking-wide">Account Manager</th>
                <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase tracking-wide">Engagements</th>
                <th className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase tracking-wide">Active</th>
                <th className="px-4 py-3 text-right text-xs text-white/30 font-mono uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const activeEngagements = client.engagements.filter(
                  (e) => e.status === 'Active'
                )
                return (
                  <tr
                    key={client.id}
                    className="border-b border-dark-600/50 hover:bg-dark-600/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="text-sm font-medium text-white hover:text-amber-400 transition-colors"
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/60">{client.account_manager}</td>
                    <td className="px-4 py-3">
                      <Badge label={client.status} variant="status" />
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-white/60">
                      {client.engagements.length}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-white/60">
                      {activeEngagements.length}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/clients/${client.id}`}
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

          {clients.length === 0 && (
            <div className="px-4 py-12 text-center text-white/30 text-sm">
              No clients yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
