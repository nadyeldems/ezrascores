'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { TopBar } from '@/components/layout/TopBar'
import Link from 'next/link'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  discipline: z.enum(['SEO','PPC','SocialAds','YouTubeAds','OrganicSocial','eCRM','CRO','UX','Design','Development']),
  day_rate: z.coerce.number().positive('Must be a positive number'),
  availability_notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function NewFreelancerPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError(null)
    try {
      const res = await fetch('/api/freelancers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create freelancer')
      }
      const freelancer = await res.json()
      router.push(`/freelancers/${freelancer.id}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div>
      <TopBar
        title="New Freelancer"
        actions={
          <Link href="/freelancers">
            <Button variant="ghost" size="sm">Cancel</Button>
          </Link>
        }
      />

      <div className="p-6 max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          <Input
            label="Full Name"
            placeholder="e.g. Alice Chen"
            error={errors.name?.message}
            {...register('name')}
          />

          <Input
            label="Email"
            type="email"
            placeholder="alice@example.com"
            error={errors.email?.message}
            {...register('email')}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Discipline"
              options={[
                'SEO','PPC','SocialAds','YouTubeAds','OrganicSocial',
                'eCRM','CRO','UX','Design','Development'
              ].map((s) => ({ value: s, label: s }))}
              placeholder="Select discipline..."
              error={errors.discipline?.message}
              {...register('discipline')}
            />
            <Input
              label="Day Rate (£)"
              type="number"
              min="1"
              placeholder="e.g. 450"
              error={errors.day_rate?.message}
              {...register('day_rate')}
            />
          </div>

          <Textarea
            label="Availability Notes"
            rows={4}
            placeholder="e.g. Available Mon-Thu. 2 weeks notice for new projects."
            error={errors.availability_notes?.message}
            {...register('availability_notes')}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Freelancer'}
            </Button>
            <Link href="/freelancers">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
