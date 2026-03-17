'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'

const schema = z.object({
  freelancer_id: z.string().min(1, 'Please select a freelancer'),
  days_allocated: z.coerce.number().positive('Must be greater than 0'),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  freelancer_brief: z.string().optional(),
  status: z.enum(['Briefed', 'InProgress', 'Delivered', 'Approved']),
})

type FormData = z.infer<typeof schema>

interface Freelancer {
  id: string
  name: string
  discipline: string
  day_rate: number
}

interface AddFreelancerModalProps {
  isOpen: boolean
  onClose: () => void
  engagementId: string
  onSuccess: () => void
}

export function AddFreelancerModal({
  isOpen,
  onClose,
  engagementId,
  onSuccess,
}: AddFreelancerModalProps) {
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'Briefed' },
  })

  useEffect(() => {
    if (isOpen) {
      fetch('/api/freelancers?active=true')
        .then((r) => r.json())
        .then(setFreelancers)
        .catch(() => {})
    }
  }, [isOpen])

  const onSubmit = async (data: FormData) => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/freelancer-engagements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, engagement_id: engagementId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to add freelancer')
      }
      reset()
      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const freelancerOptions = freelancers.map((f) => ({
    value: f.id,
    label: `${f.name} — ${f.discipline}`,
  }))

  const statusOptions = [
    { value: 'Briefed', label: 'Briefed' },
    { value: 'InProgress', label: 'In Progress' },
    { value: 'Delivered', label: 'Delivered' },
    { value: 'Approved', label: 'Approved' },
  ]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Freelancer to Engagement" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <Select
          label="Freelancer"
          options={freelancerOptions}
          placeholder="Select a freelancer..."
          error={errors.freelancer_id?.message}
          {...register('freelancer_id')}
        />

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Days Allocated"
            type="number"
            step="0.5"
            min="0.5"
            placeholder="e.g. 5"
            error={errors.days_allocated?.message}
            {...register('days_allocated')}
          />
          <Input
            label="Scheduled Start"
            type="date"
            error={errors.scheduled_start?.message}
            {...register('scheduled_start')}
          />
          <Input
            label="Scheduled End"
            type="date"
            error={errors.scheduled_end?.message}
            {...register('scheduled_end')}
          />
        </div>

        <Select
          label="Status"
          options={statusOptions}
          error={errors.status?.message}
          {...register('status')}
        />

        <Textarea
          label="Freelancer Brief"
          rows={5}
          placeholder="Specific brief for this freelancer on this engagement..."
          error={errors.freelancer_brief?.message}
          {...register('freelancer_brief')}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting || loading}>
            {isSubmitting || loading ? 'Adding...' : 'Add Freelancer'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
