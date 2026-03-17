import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns'

export async function GET() {
  try {
    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    const thirtyDaysOut = addDays(now, 30)

    // Summary counts
    const [activeClients, activeEngagements, activeFreelancers] = await Promise.all([
      prisma.client.count({ where: { status: 'Active' } }),
      prisma.engagement.count({ where: { status: 'Active' } }),
      prisma.freelancer.count({ where: { active: true } }),
    ])

    // Freelancers working this week
    const workingThisWeek = await prisma.freelancerEngagement.findMany({
      where: {
        AND: [
          { scheduled_start: { lte: weekEnd } },
          { scheduled_end: { gte: weekStart } },
          { status: { in: ['Briefed', 'InProgress'] } },
        ],
      },
      include: {
        freelancer: true,
        engagement: { include: { client: true } },
      },
    })

    // Upcoming deadlines (engagements ending in next 30 days)
    const upcomingDeadlines = await prisma.engagement.findMany({
      where: {
        status: { in: ['Active', 'Pipeline'] },
        end_date: {
          gte: now,
          lte: thirtyDaysOut,
        },
      },
      include: { client: true },
      orderBy: { end_date: 'asc' },
      take: 10,
    })

    // Check-ins this week
    const checkInsThisWeek = await prisma.weeklyCheckIn.findMany({
      where: {
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      include: { freelancer: true },
      orderBy: { date: 'desc' },
    })

    // Total outcost this month - sum of days * day_rate for active freelancer engagements
    const monthEngagements = await prisma.freelancerEngagement.findMany({
      where: {
        AND: [
          { scheduled_start: { lte: monthEnd } },
          { scheduled_end: { gte: monthStart } },
        ],
      },
      include: { freelancer: true },
    })

    const totalOutcostThisMonth = monthEngagements.reduce((sum, fe) => {
      return sum + Number(fe.days_allocated) * Number(fe.freelancer.day_rate)
    }, 0)

    const dashboardData = {
      activeClients,
      activeEngagements,
      activeFreelancers,
      totalOutcostThisMonth,
      workingThisWeek: workingThisWeek.map((fe) => ({
        id: fe.id,
        freelancerId: fe.freelancer_id,
        name: fe.freelancer.name,
        discipline: fe.freelancer.discipline,
        engagementTitle: fe.engagement.title,
        engagementId: fe.engagement_id,
        clientName: fe.engagement.client.name,
        scheduledEnd: fe.scheduled_end?.toISOString() || null,
      })),
      upcomingDeadlines: upcomingDeadlines.map((e) => ({
        id: e.id,
        title: e.title,
        clientName: e.client.name,
        endDate: e.end_date?.toISOString() || null,
        daysUntil: e.end_date
          ? Math.ceil((e.end_date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 0,
        service: e.service,
        type: e.type,
      })),
      checkInsThisWeek: checkInsThisWeek.map((ci) => ({
        id: ci.id,
        freelancerName: ci.freelancer.name,
        freelancerId: ci.freelancer_id,
        date: ci.date.toISOString(),
        attendees: ci.attendees,
        actionItemCount: Array.isArray(ci.action_items) ? ci.action_items.length : 0,
      })),
    }

    return NextResponse.json(dashboardData)
  } catch (error) {
    console.error('GET /api/dashboard error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
