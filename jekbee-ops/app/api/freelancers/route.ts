import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const activeOnly = searchParams.get('active') === 'true'

    const freelancers = await prisma.freelancer.findMany({
      where: {
        ...(activeOnly && { active: true }),
      },
      include: {
        engagements: {
          include: {
            engagement: {
              include: { client: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(freelancers)
  } catch (error) {
    console.error('GET /api/freelancers error:', error)
    return NextResponse.json({ error: 'Failed to fetch freelancers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, discipline, day_rate, availability_notes, active } = body

    if (!name || !email || !discipline || day_rate === undefined) {
      return NextResponse.json(
        { error: 'Name, email, discipline and day_rate are required' },
        { status: 400 }
      )
    }

    const freelancer = await prisma.freelancer.create({
      data: {
        name,
        email,
        discipline,
        day_rate,
        availability_notes: availability_notes || null,
        active: active !== undefined ? active : true,
      },
    })
    return NextResponse.json(freelancer, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/freelancers error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to create freelancer' }, { status: 500 })
  }
}
