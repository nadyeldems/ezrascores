'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'

interface Engagement {
  id: string
  title: string
  type: string
  service: string
  status: string
  start_date: string | null
  end_date: string | null
  client: { id: string; name: string }
  freelancers: { id: string }[]
}

const DISCIPLINES = ['SEO','PPC','SocialAds','YouTubeAds','OrganicSocial','eCRM','CRO','UX','Design','Development']
const TYPES = ['Retainer','Project','AdCampaign']
const STATUSES = ['Active','Paused','Completed','Pipeline']

export default function EngagementsPage() {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])

  // Filters
  const [filterClient, setFilterClient] = useState('')
  const [filterService, setFilterService] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    fetch('/api/engagements')
      .then((r) => r.json())
      .then((data) => { setEngagements(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const clients = useMemo(() => {
    const map = new Map<string, string>()
    engagements.forEach((e) => map.set(e.client.id, e.client.name))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [engagements])

  const filtered = useMemo(() => {
    return engagements.filter((e) => {
      if (filterClient && e.client.id !== filterClient) return false
      if (filterService && e.service !== filterService) return false
      if (filterType && e.type !== filterType) return false
      if (filterStatus && e.status !== filterStatus) return false
      return true
    })
  }, [engagements, filterClient, filterService, filterType, filterStatus])

  const columns = useMemo<ColumnDef<Engagement>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <Link
            href={`/engagements/${row.original.id}`}
            className="text-sm text-white hover:text-amber-400 transition-colors"
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'client',
        header: 'Client',
        accessorFn: (row) => row.client.name,
        cell: ({ row }) => (
          <Link
            href={`/clients/${row.original.client.id}`}
            className="text-xs text-white/60 hover:text-amber-400 transition-colors"
          >
            {row.original.client.name}
          </Link>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ getValue }) => <Badge label={getValue() as string} variant="type" />,
      },
      {
        accessorKey: 'service',
        header: 'Service',
        cell: ({ getValue }) => <Badge label={getValue() as string} variant="service" />,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <Badge label={getValue() as string} variant="status" />,
      },
      {
        accessorKey: 'start_date',
        header: 'Start',
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return <span className="text-xs font-mono text-white/50">{v ? format(parseISO(v), 'd MMM yy') : '—'}</span>
        },
      },
      {
        accessorKey: 'end_date',
        header: 'End',
        cell: ({ getValue }) => {
          const v = getValue() as string | null
          return <span className="text-xs font-mono text-white/50">{v ? format(parseISO(v), 'd MMM yy') : '—'}</span>
        },
      },
      {
        id: 'team',
        header: 'Team',
        accessorFn: (row) => row.freelancers.length,
        cell: ({ getValue }) => (
          <span className="text-xs font-mono text-white/50">{getValue() as number}</span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div>
      <TopBar
        title="Engagements"
        subtitle={`${filtered.length} of ${engagements.length}`}
        actions={
          <Link href="/engagements/new">
            <Button variant="primary" size="sm">+ New Engagement</Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="px-6 py-3 border-b border-dark-600 bg-dark-800 flex gap-3 flex-wrap">
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="bg-dark-600 border border-dark-400 text-white/70 text-xs px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-400/60"
        >
          <option value="">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
          className="bg-dark-600 border border-dark-400 text-white/70 text-xs px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-400/60"
        >
          <option value="">All Services</option>
          {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-dark-600 border border-dark-400 text-white/70 text-xs px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-400/60"
        >
          <option value="">All Types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-dark-600 border border-dark-400 text-white/70 text-xs px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-400/60"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {(filterClient || filterService || filterType || filterStatus) && (
          <button
            onClick={() => { setFilterClient(''); setFilterService(''); setFilterType(''); setFilterStatus('') }}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-white/30 text-sm font-mono animate-pulse p-4">Loading...</div>
        ) : (
          <div className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-dark-500">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs text-white/30 font-mono uppercase tracking-wide cursor-pointer select-none hover:text-white/50 transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' && <span className="text-amber-400">↑</span>}
                          {header.column.getIsSorted() === 'desc' && <span className="text-amber-400">↓</span>}
                        </div>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-dark-600/50 hover:bg-dark-600/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center text-white/30 text-sm">
                No engagements match your filters
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
