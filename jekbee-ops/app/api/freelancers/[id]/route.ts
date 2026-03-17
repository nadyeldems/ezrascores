import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const freelancer = await prisma.freelancer.findUnique({
      where: { id: params.id },
      include: {
        engagements: {
          include: {
            engagement: {
              include: { client: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        checkIns: {
          orderBy: { date: 'desc' },
          take: 10,
        },
      },
    })

    if (!freelancer) {
      return NextResponse.json({ error: 'Freelancer not found' }, { status: 404 })
    }

    return NextResponse.json(freelancer)
  } catch (error) {
    console.error('GET /api/freelancers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch freelancer' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const { name, email, discipline, day_rate, availability_notes, active } = body

    const freelancer = await prisma.freelancer.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(discipline !== undefined && { discipline }),
        ...(day_rate !== undefined && { day_rate }),
        ...(availability_notes !== undefined && { availability_notes }),
        ...(active !== undefined && { active }),
      },
    })
    return NextResponse.json(freelancer)
  } catch (error) {
    console.error('PUT /api/freelancers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update freelancer' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.freelancer.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/freelancers/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete freelancer' }, { status: 500 })
  }
}
