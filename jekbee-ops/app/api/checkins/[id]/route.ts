import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const checkin = await prisma.weeklyCheckIn.findUnique({
      where: { id: params.id },
      include: { freelancer: true },
    })

    if (!checkin) {
      return NextResponse.json({ error: 'Check-in not found' }, { status: 404 })
    }

    return NextResponse.json(checkin)
  } catch (error) {
    console.error('GET /api/checkins/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch check-in' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { date, attendees, notes, action_items } = body

    const checkin = await prisma.weeklyCheckIn.update({
      where: { id: params.id },
      data: {
        ...(date !== undefined && { date: new Date(date) }),
        ...(attendees !== undefined && { attendees }),
        ...(notes !== undefined && { notes }),
        ...(action_items !== undefined && { action_items }),
      },
      include: { freelancer: true },
    })
    return NextResponse.json(checkin)
  } catch (error) {
    console.error('PUT /api/checkins/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update check-in' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.weeklyCheckIn.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/checkins/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete check-in' }, { status: 500 })
  }
}
