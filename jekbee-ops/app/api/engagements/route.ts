import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const service = searchParams.get('service')

    const engagements = await prisma.engagement.findMany({
      where: {
        ...(clientId && { client_id: clientId }),
        ...(status && { status: status as any }),
        ...(type && { type: type as any }),
        ...(service && { service: service as any }),
      },
      include: {
        client: true,
        freelancers: {
          include: { freelancer: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(engagements)
  } catch (error) {
    console.error('GET /api/engagements error:', error)
    return NextResponse.json({ error: 'Failed to fetch engagements' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      client_id,
      title,
      type,
      service,
      status,
      start_date,
      end_date,
      brief,
      jekbee_margin_percent,
    } = body

    if (!client_id || !title || !type || !service) {
      return NextResponse.json(
        { error: 'client_id, title, type, and service are required' },
        { status: 400 }
      )
    }

    const engagement = await prisma.engagement.create({
      data: {
        client_id,
        title,
        type,
        service,
        status: status || 'Active',
        start_date: start_date ? new Date(start_date) : null,
        end_date: end_date ? new Date(end_date) : null,
        brief: brief || null,
        jekbee_margin_percent: jekbee_margin_percent ?? 30,
      },
      include: {
        client: true,
        freelancers: { include: { freelancer: true } },
      },
    })
    return NextResponse.json(engagement, { status: 201 })
  } catch (error) {
    console.error('POST /api/engagements error:', error)
    return NextResponse.json({ error: 'Failed to create engagement' }, { status: 500 })
  }
}
