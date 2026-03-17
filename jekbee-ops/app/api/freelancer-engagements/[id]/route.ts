import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const record = await prisma.freelancerEngagement.findUnique({
      where: { id: params.id },
      include: {
        freelancer: true,
        engagement: { include: { client: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('GET /api/freelancer-engagements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch record' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const {
      days_allocated,
      scheduled_start,
      scheduled_end,
      freelancer_brief,
      status,
    } = body

    const record = await prisma.freelancerEngagement.update({
      where: { id: params.id },
      data: {
        ...(days_allocated !== undefined && { days_allocated }),
        ...(scheduled_start !== undefined && {
          scheduled_start: scheduled_start ? new Date(scheduled_start) : null,
        }),
        ...(scheduled_end !== undefined && {
          scheduled_end: scheduled_end ? new Date(scheduled_end) : null,
        }),
        ...(freelancer_brief !== undefined && { freelancer_brief }),
        ...(status !== undefined && { status }),
      },
      include: {
        freelancer: true,
        engagement: { include: { client: true } },
      },
    })
    return NextResponse.json(record)
  } catch (error) {
    console.error('PUT /api/freelancer-engagements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.freelancerEngagement.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/freelancer-engagements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 })
  }
}
