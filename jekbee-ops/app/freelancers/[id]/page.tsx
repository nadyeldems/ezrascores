'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'

interface FreelancerDetail {
  id: string
  name: string
  email: string
  discipline: string
  day_rate: number
  availability_notes: string | null
  active: boolean
  engagements: {
    id: string
    days_allocated: number
    scheduled_start: string | null
    scheduled_end: string | null
    status: string
    engagement: {
      id: string
      title: string
      service: string
      client: { id: string; name: string }
    }
  }[]
  checkIns: {
    id: string
    date: string
    attendees: string | null
    action_items: any[]
  }[]
}

export default function FreelancerDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [freelancer, setFreelancer] = useState<FreelancerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    discipline: '',
    day_rate: '',
    availability_notes: '',
    active: true,
  })

  const fetchFreelancer = useCallback(async () => {
    const res = await fetch(`/api/freelancers/${id}`)
    if (res.ok) {
      const data = await res.json()
      setFreelancer(data)
      setEditForm({
        name: data.name,
        email: data.email,
        discipline: data.discipline,
        day_rate: String(data.day_rate),
        availability_notes: data.availability_notes || '',
        active: data.active,
      })
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchFreelancer()
  }, [fetchFreelancer])

  const handleSave = async () => {
    setSaving(true)
    await fetch(`/api/freelancers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...editForm,
        day_rate: parseFloat(editForm.day_rate),
      }),
    })
    setSaving(false)
    setEditing(false)
    fetchFreelancer()
  }

  const DISCIPLINES = ['SEO','PPC','SocialAds','YouTubeAds','OrganicSocial','eCRM','CRO','UX','Design','Development']

  if (loading) {
    return <div className="p-6 text-white/30 text-sm font-mono animate-pulse">Loading...</div>
  }

  if (!freelancer) {
    return <div className="p-6 text-red-400 text-sm">Freelancer not found</div>
  }

  const activeEngagements = freelancer.engagements.filter(
    (e) => e.status === 'Briefed' || e.status === 'InProgress'
  )

  return (
    <div>
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-600 bg-dark-800">
        <div className="flex items-center gap-2 text-xs text-white/30 mb-1">
          <Link href="/freelancers" className="hover:text-white/60">Freelancers</Link>
          <span>/</span>
          <span className="text-white/60">{freelancer.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-dark-600 border border-dark-400 rounded-full flex items-center justify-center text-sm font-mono text-amber-400 font-bold">
              {freelancer.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white">{freelancer.name}</h1>
                <div className={`w-2 h-2 rounded-full ${freelancer.active ? 'bg-green-400' : 'bg-dark-400'}`} />
              </div>
              <div className="flex items-center gap-2">
                <Badge label={freelancer.discipline} variant="service" />
                <span className="text-xs text-white/30">{freelancer.email}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-white/30 font-mono uppercase">Day Rate</p>
              <p className="text-lg font-mono font-bold text-amber-400">
                £{Number(freelancer.day_rate).toLocaleString('en-GB')}
              </p>
            </div>
            {!editing && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Edit Profile
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Profile edit */}
        {editing ? (
          <div className="bg-dark-700 border border-dark-500 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white mb-4">Edit Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Discipline"
                value={editForm.discipline}
                options={DISCIPLINES.map((d) => ({ value: d, label: d }))}
                onChange={(e) => setEditForm({ ...editForm, discipline: e.target.value })}
              />
              <Input
                label="Day Rate (£)"
                type="number"
                value={editForm.day_rate}
                onChange={(e) => setEditForm({ ...editForm, day_rate: e.target.value })}
              />
            </div>
            <Textarea
              label="Availability Notes"
              rows={3}
              value={editForm.availability_notes}
              onChange={(e) => setEditForm({ ...editForm, availability_notes: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={editForm.active}
                onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                className="accent-amber-400"
              />
              <label htmlFor="active" className="text-xs text-white/60">Active</label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          freelancer.availability_notes && (
            <div className="bg-dark-700 border border-dark-500 rounded-lg p-4">
              <p className="text-xs text-white/30 font-mono uppercase mb-1.5">Availability Notes</p>
              <p className="text-sm text-white/70">{freelancer.availability_notes}</p>
            </div>
          )
        )}

        {/* Current engagements */}
        <div className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Engagements</h2>
            <span className="text-xs font-mono text-white/30">
              {activeEngagements.length} active
            </span>
          </div>
          {freelancer.engagements.length === 0 ? (
            <div className="px-4 py-10 text-center text-white/30 text-sm">No engagements</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-600">
                  <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Engagement</th>
                  <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Client</th>
                  <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Service</th>
                  <th className="px-4 py-2 text-right text-xs text-white/30 font-mono uppercase">Days</th>
                  <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Scheduled</th>
                  <th className="px-4 py-2 text-left text-xs text-white/30 font-mono uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {freelancer.engagements.map((fe) => (
                  <tr key={fe.id} className="border-b border-dark-600/50 hover:bg-dark-600/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/engagements/${fe.engagement.id}`}
                        className="text-sm text-white hover:text-amber-400 transition-colors"
                      >
                        {fe.engagement.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${fe.engagement.client.id}`}
                        className="text-xs text-white/60 hover:text-amber-400 transition-colors"
                      >
                        {fe.engagement.client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={fe.engagement.service} variant="service" />
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-white/70">
                      {Number(fe.days_allocated)}d
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-white/50">
                      {fe.scheduled_start ? format(parseISO(fe.scheduled_start), 'd MMM') : '—'}
                      {' → '}
                      {fe.scheduled_end ? format(parseISO(fe.scheduled_end), 'd MMM') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={fe.status} variant="status" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Check-in history */}
        <div className="bg-dark-700 border border-dark-500 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-dark-500">
            <h2 className="text-sm font-semibold text-white">Check-in History</h2>
          </div>
          {freelancer.checkIns.length === 0 ? (
            <div className="px-4 py-10 text-center text-white/30 text-sm">No check-ins yet</div>
          ) : (
            <div className="divide-y divide-dark-600/50">
              {freelancer.checkIns.map((ci) => {
                const actionItems = Array.isArray(ci.action_items) ? ci.action_items : []
                const openItems = actionItems.filter((a: any) => !a.completed)
                return (
                  <Link
                    key={ci.id}
                    href={`/checkins/${ci.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-dark-600/30 transition-colors"
                  >
                    <div>
                      <p className="text-sm text-white">
                        {format(parseISO(ci.date), 'EEEE d MMMM yyyy')}
                      </p>
                      <p className="text-xs text-white/30 mt-0.5">{ci.attendees || 'No attendees recorded'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono text-white/40">
                        {actionItems.length} action{actionItems.length !== 1 ? 's' : ''}
                      </p>
                      {openItems.length > 0 && (
                        <p className="text-xs font-mono text-amber-400">
                          {openItems.length} open
                        </p>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
