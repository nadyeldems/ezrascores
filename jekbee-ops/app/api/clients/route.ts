import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const clients = await prisma.client.findMany({
      include: {
        engagements: {
          include: {
            freelancers: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(clients)
  } catch (error) {
    console.error('GET /api/clients error:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, account_manager, status } = body

    if (!name || !account_manager) {
      return NextResponse.json({ error: 'Name and account manager are required' }, { status: 400 })
    }

    const client = await prisma.client.create({
      data: {
        name,
        account_manager,
        status: status || 'Active',
      },
    })
    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('POST /api/clients error:', error)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}
