'use client'

import React, { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { AddFreelancerModal } from './AddFreelancerModal'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'

interface FreelancerTeamMember {
  id: string
  freelancerId: string
  name: string
  discipline: string
  daysAllocated: number
  scheduledStart: string | null
  scheduledEnd: string | null
  status: string
  freelancerBrief: string | null
}

interface FreelancerTeamSectionProps {
  engagementId: string
  initialTeam: FreelancerTeamMember[]
  onTeamUpdate?: () => void
}

export function FreelancerTeamSection({
  engagementId,
  initialTeam,
  onTeamUpdate,
}: FreelancerTeamSectionProps) {
  const [team, setTeam] = useState(initialTeam)
  const [showModal, setShowModal] = useState(false)
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null)

  const handleSuccess = async () => {
    // Refresh team data
    const res = await fetch(`/api/freelancer-engagements?engagementId=${engagementId}`)
    if (res.ok) {
      const data = await res.json()
      setTeam(
        data.map((fe: any) => ({
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
      )
      onTeamUpdate?.()
    }
  }

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this freelancer from the engagement?')) return
    const res = await fetch(`/api/freelancer-engagements/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTeam((prev) => prev.filter((m) => m.id !== id))
      onTeamUpdate?.()
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    const res = await fetch(`/api/freelancer-engagements/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)))
    }
  }

  return (
    <div className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          Freelancer Team
          <span className="ml-2 text-xs font-mono text-white/30">{team.length}</span>
        </h2>
        <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
          + Add Freelancer
        </Button>
      </div>

      {team.length === 0 ? (
        <div className="px-4 py-10 text-center text-white/30 text-sm">
          No freelancers assigned yet
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-600">
              <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Name</th>
              <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Discipline</th>
              <th className="px-4 py-2 text-right text-xs text-white/30 font-mono uppercase">Days</th>
              <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Start</th>
              <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">End</th>
              <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Brief</th>
              <th className="px-4 py-2 text-right text-xs text-white/30 font-mono uppercase"></th>
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <React.Fragment key={member.id}>
                <tr className="border-b border-dark-600/50 hover:bg-dark-600/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/freelancers/${member.freelancerId}`}
                      className="text-sm text-white hover:text-amber-400 transition-colors"
                    >
                      {member.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={member.discipline} variant="service" />
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-white/70">
                    {member.daysAllocated}d
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-white/50">
                    {member.scheduledStart
                      ? format(parseISO(member.scheduledStart), 'd MMM')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-white/50">
                    {member.scheduledEnd
                      ? format(parseISO(member.scheduledEnd), 'd MMM')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={member.status}
                      onChange={(e) => handleStatusChange(member.id, e.target.value)}
                      className="bg-transparent text-xs font-mono border-0 outline-none cursor-pointer"
                      style={{ color: 'inherit' }}
                    >
                      {['Briefed', 'InProgress', 'Delivered', 'Approved'].map((s) => (
                        <option key={s} value={s} className="bg-dark-700">
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {member.freelancerBrief ? (
                      <button
                        onClick={() =>
                          setExpandedBrief(expandedBrief === member.id ? null : member.id)
                        }
                        className="text-xs text-white/40 hover:text-amber-400 transition-colors max-w-[200px] text-left truncate"
                      >
                        {member.freelancerBrief.substring(0, 60)}...
                      </button>
                    ) : (
                      <span className="text-xs text-white/20">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
                {expandedBrief === member.id && member.freelancerBrief && (
                  <tr className="border-b border-dark-600/50">
                    <td colSpan={8} className="px-4 py-3 bg-dark-600/30">
                      <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">
                        {member.freelancerBrief}
                      </p>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      <AddFreelancerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        engagementId={engagementId}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
