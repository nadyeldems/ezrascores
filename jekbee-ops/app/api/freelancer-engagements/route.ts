import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const engagementId = searchParams.get('engagementId')
    const freelancerId = searchParams.get('freelancerId')

    const records = await prisma.freelancerEngagement.findMany({
      where: {
        ...(engagementId && { engagement_id: engagementId }),
        ...(freelancerId && { freelancer_id: freelancerId }),
      },
      include: {
        freelancer: true,
        engagement: {
          include: { client: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(records)
  } catch (error) {
    console.error('GET /api/freelancer-engagements error:', error)
    return NextResponse.json({ error: 'Failed to fetch freelancer engagements' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      freelancer_id,
      engagement_id,
      days_allocated,
      scheduled_start,
      scheduled_end,
      freelancer_brief,
      status,
    } = body

    if (!freelancer_id || !engagement_id || days_allocated === undefined) {
      return NextResponse.json(
        { error: 'freelancer_id, engagement_id, and days_allocated are required' },
        { status: 400 }
      )
    }

    const record = await prisma.freelancerEngagement.create({
      data: {
        freelancer_id,
        engagement_id,
        days_allocated,
        scheduled_start: scheduled_start ? new Date(scheduled_start) : null,
        scheduled_end: scheduled_end ? new Date(scheduled_end) : null,
        freelancer_brief: freelancer_brief || null,
        status: status || 'Briefed',
      },
      include: {
        freelancer: true,
        engagement: { include: { client: true } },
      },
    })
    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('POST /api/freelancer-engagements error:', error)
    return NextResponse.json({ error: 'Failed to create freelancer engagement' }, { status: 500 })
  }
}
