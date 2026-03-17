'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { TopBar } from '@/components/layout/TopBar'
import Link from 'next/link'

const actionItemSchema = z.object({
  item: z.string().min(1, 'Action item text is required'),
  owner: z.string().min(1, 'Owner is required'),
  due_date: z.string().optional(),
  completed: z.boolean().default(false),
})

const schema = z.object({
  freelancer_id: z.string().min(1, 'Please select a freelancer'),
  date: z.string().min(1, 'Date is required'),
  attendees: z.string().optional(),
  notes: z.string().optional(),
  action_items: z.array(actionItemSchema),
})

type FormData = z.infer<typeof schema>

interface Freelancer {
  id: string
  name: string
  discipline: string
}

export default function NewCheckInPage() {
  const router = useRouter()
  const [freelancers, setFreelancers] = useState<Freelancer[]>([])
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      action_items: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'action_items',
  })

  useEffect(() => {
    fetch('/api/freelancers?active=true')
      .then((r) => r.json())
      .then(setFreelancers)
      .catch(() => {})
  }, [])

  const onSubmit = async (data: FormData) => {
    setError(null)
    try {
      const res = await fetch('/api/checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create check-in')
      }
      const checkin = await res.json()
      router.push(`/checkins/${checkin.id}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const freelancerOptions = freelancers.map((f) => ({
    value: f.id,
    label: `${f.name} — ${f.discipline}`,
  }))

  return (
    <div>
      <TopBar
        title="New Check-in"
        actions={
          <Link href="/checkins">
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

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Freelancer"
              options={freelancerOptions}
              placeholder="Select freelancer..."
              error={errors.freelancer_id?.message}
              {...register('freelancer_id')}
            />
            <Input
              label="Date"
              type="date"
              error={errors.date?.message}
              {...register('date')}
            />
          </div>

          <Input
            label="Attendees"
            placeholder="e.g. Sarah Mitchell, Alice Chen"
            error={errors.attendees?.message}
            {...register('attendees')}
          />

          <Textarea
            label="Notes"
            rows={6}
            placeholder="Meeting notes, updates, progress..."
            error={errors.notes?.message}
            {...register('notes')}
          />

          {/* Action Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-white/60 uppercase tracking-wide">
                Action Items
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => append({ item: '', owner: '', due_date: '', completed: false })}
              >
                + Add Item
              </Button>
            </div>

            {fields.length === 0 && (
              <div className="text-xs text-white/30 italic px-1">
                No action items. Click "Add Item" to add one.
              </div>
            )}

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="bg-dark-600 border border-dark-400 rounded-md p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <Textarea
                      rows={2}
                      placeholder="Action item..."
                      className="flex-1 text-xs"
                      error={errors.action_items?.[index]?.item?.message}
                      {...register(`action_items.${index}.item`)}
                    />
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-white/20 hover:text-red-400 transition-colors mt-0.5 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Owner"
                      className="text-xs"
                      error={errors.action_items?.[index]?.owner?.message}
                      {...register(`action_items.${index}.owner`)}
                    />
                    <Input
                      type="date"
                      className="text-xs"
                      {...register(`action_items.${index}.due_date`)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Check-in'}
            </Button>
            <Link href="/checkins">
              <Button type="button" variant="ghost">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
