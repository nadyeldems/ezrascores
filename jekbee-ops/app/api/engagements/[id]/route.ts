import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const engagement = await prisma.engagement.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        freelancers: {
          include: { freelancer: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!engagement) {
      return NextResponse.json({ error: 'Engagement not found' }, { status: 404 })
    }

    return NextResponse.json(engagement)
  } catch (error) {
    console.error('GET /api/engagements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch engagement' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const {
      title,
      type,
      service,
      status,
      start_date,
      end_date,
      brief,
      jekbee_margin_percent,
    } = body

    const engagement = await prisma.engagement.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(type !== undefined && { type }),
        ...(service !== undefined && { service }),
        ...(status !== undefined && { status }),
        ...(start_date !== undefined && { start_date: start_date ? new Date(start_date) : null }),
        ...(end_date !== undefined && { end_date: end_date ? new Date(end_date) : null }),
        ...(brief !== undefined && { brief }),
        ...(jekbee_margin_percent !== undefined && { jekbee_margin_percent }),
      },
      include: {
        client: true,
        freelancers: { include: { freelancer: true } },
      },
    })
    return NextResponse.json(engagement)
  } catch (error) {
    console.error('PUT /api/engagements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update engagement' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.freelancerEngagement.deleteMany({ where: { engagement_id: params.id } })
    await prisma.engagement.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/engagements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete engagement' }, { status: 500 })
  }
}
