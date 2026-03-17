'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { TopBar } from '@/components/layout/TopBar'
import Link from 'next/link'

const schema = z.object({
  client_id: z.string().min(1, 'Please select a client'),
  title: z.string().min(1, 'Title is required'),
  type: z.enum(['Retainer', 'Project', 'AdCampaign']),
  service: z.enum(['SEO','PPC','SocialAds','YouTubeAds','OrganicSocial','eCRM','CRO','UX','Design','Development']),
  status: z.enum(['Active','Paused','Completed','Pipeline']),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  brief: z.string().optional(),
  jekbee_margin_percent: z.coerce.number().min(0).max(99),
})

type FormData = z.infer<typeof schema>

interface Client {
  id: string
  name: string
}

export default function NewEngagementPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'Active',
      jekbee_margin_percent: 30,
    },
  })

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then(setClients)
      .catch(() => {})
  }, [])

  const onSubmit = async (data: FormData) => {
    setError(null)
    try {
      const res = await fetch('/api/engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create engagement')
      }
      const engagement = await res.json()
      router.push(`/engagements/${engagement.id}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }))

  return (
    <div>
      <TopBar
        title="New Engagement"
        actions={
          <Link href="/engagements">
            <Button variant="ghost" size="sm">Cancel</Button>
          </Link>
        }
      />

      <div className="p-6 max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <Select
            label="Client"
            options={clientOptions}
            placeholder="Select a client..."
            error={errors.client_id?.message}
            {...register('client_id')}
          />

          <Input
            label="Title"
            placeholder="e.g. Acme SEO Retainer Q1 2026"
            error={errors.title?.message}
            {...register('title')}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              options={[
                { value: 'Retainer', label: 'Retainer' },
                { value: 'Project', label: 'Project' },
                { value: 'AdCampaign', label: 'Ad Campaign' },
              ]}
              error={errors.type?.message}
              {...register('type')}
            />
            <Select
              label="Service"
              options={[
                'SEO','PPC','SocialAds','YouTubeAds','OrganicSocial',
                'eCRM','CRO','UX','Design','Development'
              ].map((s) => ({ value: s, label: s }))}
              error={errors.service?.message}
              {...register('service')}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Status"
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Pipeline', label: 'Pipeline' },
                { value: 'Paused', label: 'Paused' },
                { value: 'Completed', label: 'Completed' },
              ]}
              error={errors.status?.message}
              {...register('status')}
            />
            <Input
              label="Start Date"
              type="date"
              error={errors.start_date?.message}
              {...register('start_date')}
            />
            <Input
              label="End Date"
              type="date"
              error={errors.end_date?.message}
              {...register('end_date')}
            />
          </div>

          <Input
            label="JEKBEE Margin %"
            type="number"
            min="0"
            max="99"
            step="0.5"
            error={errors.jekbee_margin_percent?.message}
            {...register('jekbee_margin_percent')}
          />

          <Textarea
            label="Brief"
            rows={6}
            placeholder="Engagement brief, scope, deliverables..."
            error={errors.brief?.message}
            {...register('brief')}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Engagement'}
            </Button>
            <Link href="/engagements">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
