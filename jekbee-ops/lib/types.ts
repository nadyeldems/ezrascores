import type {
  Freelancer,
  Client,
  Engagement,
  FreelancerEngagement,
  WeeklyCheckIn,
  Discipline,
  ClientStatus,
  EngagementType,
  EngagementStatus,
  FreelancerEngagementStatus,
} from '@prisma/client'

export type {
  Freelancer,
  Client,
  Engagement,
  FreelancerEngagement,
  WeeklyCheckIn,
  Discipline,
  ClientStatus,
  EngagementType,
  EngagementStatus,
  FreelancerEngagementStatus,
}

export type FreelancerWithEngagements = Freelancer & {
  engagements: (FreelancerEngagement & {
    engagement: Engagement & {
      client: Client
    }
  })[]
  checkIns: WeeklyCheckIn[]
}

export type EngagementWithDetails = Engagement & {
  client: Client
  freelancers: (FreelancerEngagement & {
    freelancer: Freelancer
  })[]
}

export type ClientWithEngagements = Client & {
  engagements: (Engagement & {
    freelancers: FreelancerEngagement[]
  })[]
}

export type WeeklyCheckInWithFreelancer = WeeklyCheckIn & {
  freelancer: Freelancer
}

export type FreelancerEngagementWithDetails = FreelancerEngagement & {
  freelancer: Freelancer
  engagement: Engagement & {
    client: Client
  }
}

export type ActionItem = {
  item: string
  owner: string
  due_date: string
  completed: boolean
}

export type DashboardData = {
  activeClients: number
  activeEngagements: number
  activeFreelancers: number
  totalOutcostThisMonth: number
  workingThisWeek: {
    id: string
    name: string
    discipline: Discipline
    engagementTitle: string
    clientName: string
    scheduledEnd: string | null
  }[]
  upcomingDeadlines: {
    id: string
    title: string
    clientName: string
    endDate: string | null
    daysUntil: number
    service: Discipline
    type: EngagementType
  }[]
  checkInsThisWeek: {
    id: string
    freelancerName: string
    date: string
    attendees: string | null
    actionItemCount: number
  }[]
}

export const SERVICE_COLORS: Record<Discipline, string> = {
  SEO: '#4ADE80',
  PPC: '#60A5FA',
  SocialAds: '#F472B6',
  YouTubeAds: '#F87171',
  OrganicSocial: '#A78BFA',
  eCRM: '#34D399',
  CRO: '#FBBF24',
  UX: '#38BDF8',
  Design: '#E879F9',
  Development: '#94A3B8',
}

export const SERVICE_BG_CLASSES: Record<string, string> = {
  SEO: 'bg-green-400/20 text-green-400 border-green-400/30',
  PPC: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
  SocialAds: 'bg-pink-400/20 text-pink-400 border-pink-400/30',
  YouTubeAds: 'bg-red-400/20 text-red-400 border-red-400/30',
  OrganicSocial: 'bg-purple-400/20 text-purple-400 border-purple-400/30',
  eCRM: 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30',
  CRO: 'bg-amber-400/20 text-amber-400 border-amber-400/30',
  UX: 'bg-sky-400/20 text-sky-400 border-sky-400/30',
  Design: 'bg-fuchsia-400/20 text-fuchsia-400 border-fuchsia-400/30',
  Development: 'bg-slate-400/20 text-slate-400 border-slate-400/30',
}

export const STATUS_CLASSES: Record<string, string> = {
  Active: 'bg-green-400/20 text-green-400 border-green-400/30',
  Paused: 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30',
  Completed: 'bg-slate-400/20 text-slate-400 border-slate-400/30',
  Pipeline: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
  Churned: 'bg-red-400/20 text-red-400 border-red-400/30',
  Briefed: 'bg-sky-400/20 text-sky-400 border-sky-400/30',
  InProgress: 'bg-amber-400/20 text-amber-400 border-amber-400/30',
  Delivered: 'bg-green-400/20 text-green-400 border-green-400/30',
  Approved: 'bg-teal-400/20 text-teal-400 border-teal-400/30',
}
