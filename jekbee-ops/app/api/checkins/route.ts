import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const freelancerId = searchParams.get('freelancerId')

    const checkins = await prisma.weeklyCheckIn.findMany({
      where: {
        ...(freelancerId && { freelancer_id: freelancerId }),
      },
      include: { freelancer: true },
      orderBy: { date: 'desc' },
    })
    return NextResponse.json(checkins)
  } catch (error) {
    console.error('GET /api/checkins error:', error)
    return NextResponse.json({ error: 'Failed to fetch check-ins' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { freelancer_id, date, attendees, notes, action_items } = body

    if (!freelancer_id || !date) {
      return NextResponse.json(
        { error: 'freelancer_id and date are required' },
        { status: 400 }
      )
    }

    const checkin = await prisma.weeklyCheckIn.create({
      data: {
        freelancer_id,
        date: new Date(date),
        attendees: attendees || null,
        notes: notes || null,
        action_items: action_items || [],
      },
      include: { freelancer: true },
    })
    return NextResponse.json(checkin, { status: 201 })
  } catch (error) {
    console.error('POST /api/checkins error:', error)
    return NextResponse.json({ error: 'Failed to create check-in' }, { status: 500 })
  }
}
