import { PrismaClient, Discipline, ClientStatus, EngagementType, EngagementStatus, FreelancerEngagementStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Clear existing data
  await prisma.weeklyCheckIn.deleteMany()
  await prisma.freelancerEngagement.deleteMany()
  await prisma.engagement.deleteMany()
  await prisma.client.deleteMany()
  await prisma.freelancer.deleteMany()

  // Clients
  const johnWest = await prisma.client.create({ data: { name: 'John West Foods', account_manager: 'Sarah Mitchell', status: 'Active' } })
  const keyper = await prisma.client.create({ data: { name: 'KEYper Systems', account_manager: 'Tom Reynolds', status: 'Active' } })
  const gts = await prisma.client.create({ data: { name: 'GTS Logistics UK', account_manager: 'Sarah Mitchell', status: 'Active' } })

  // Freelancers
  const alice = await prisma.freelancer.create({ data: { name: 'Alice Chen', email: 'alice@freelance.com', discipline: 'SEO', day_rate: 450, availability_notes: 'Available Mon-Thu. 2 weeks notice required for new projects.', active: true } })
  const marcus = await prisma.freelancer.create({ data: { name: 'Marcus Webb', email: 'marcus@freelance.com', discipline: 'PPC', day_rate: 500, availability_notes: 'Full availability. Prefers remote briefings.', active: true } })
  const priya = await prisma.freelancer.create({ data: { name: 'Priya Sharma', email: 'priya@freelance.com', discipline: 'SocialAds', day_rate: 400, availability_notes: 'Part-time Fridays. Based in Manchester.', active: true } })
  const jamie = await prisma.freelancer.create({ data: { name: 'Jamie Ford', email: 'jamie@freelance.com', discipline: 'Design', day_rate: 350, availability_notes: 'Available full time. Fast turnaround on revisions.', active: true } })
  const neil = await prisma.freelancer.create({ data: { name: 'Neil Patel', email: 'neil@freelance.com', discipline: 'Development', day_rate: 600, availability_notes: 'Senior dev. Min 3 days per booking. 1 week notice.', active: true } })
  const sofia = await prisma.freelancer.create({ data: { name: 'Sofia Russo', email: 'sofia@freelance.com', discipline: 'CRO', day_rate: 475, availability_notes: 'Available for projects and retainers. Based in London.', active: true } })
  const ben = await prisma.freelancer.create({ data: { name: 'Ben Carter', email: 'ben@freelance.com', discipline: 'OrganicSocial', day_rate: 300, availability_notes: 'Mon-Wed only. Good for content calendar and scheduling work.', active: true } })

  // Engagements
  const jwSEO = await prisma.engagement.create({ data: {
    client_id: johnWest.id, title: 'John West SEO Retainer Q1 2026', type: 'Retainer', service: 'SEO', status: 'Active',
    start_date: new Date('2026-01-01'), end_date: new Date('2026-03-31'),
    brief: 'Full SEO retainer for John West Foods. Focus on category pages for tinned fish and protein products. Monthly deliverables: technical audit actions (5/month), content briefs (4/month), link building outreach (10 prospects/month). Target: improve rankings for "tinned tuna UK", "canned salmon", "protein fish" and related. Secondary goal: structured data implementation across product pages.',
    jekbee_margin_percent: 30
  }})

  const jwDesign = await prisma.engagement.create({ data: {
    client_id: johnWest.id, title: 'John West Brand Refresh – Landing Pages', type: 'Project', service: 'Design', status: 'Active',
    start_date: new Date('2026-02-01'), end_date: new Date('2026-04-15'),
    brief: 'Design refresh for 6 hero landing pages. New visual direction approved by client in Jan 2026 brand workshop. Deliverables: desktop + mobile designs in Figma, design system tokens, handoff pack for dev. Must align with new packaging colour palette (navy, white, red accents).',
    jekbee_margin_percent: 35
  }})

  const keyperPPC = await prisma.engagement.create({ data: {
    client_id: keyper.id, title: 'KEYper Systems Google Ads – Lead Gen', type: 'AdCampaign', service: 'PPC', status: 'Active',
    start_date: new Date('2026-01-15'), end_date: new Date('2026-06-30'),
    brief: 'Google Ads campaign for KEYper Systems (B2B SaaS – access control software). Goal: generate qualified demo requests. Budget: £8,000/month. Campaigns: Search (branded + non-branded), Display remarketing. KPIs: CPL < £120, 50 qualified leads/month. Audience: facilities managers, IT managers, security directors at companies 50–500 employees.',
    jekbee_margin_percent: 28
  }})

  const keyperCRO = await prisma.engagement.create({ data: {
    client_id: keyper.id, title: 'KEYper Homepage CRO Sprint', type: 'Project', service: 'CRO', status: 'Pipeline',
    start_date: new Date('2026-04-01'), end_date: new Date('2026-05-15'),
    brief: 'CRO sprint focused on homepage and demo request form. Run 2 A/B tests. Deliverables: heatmap analysis report, 2 test hypotheses with implementation specs, test results report. Tools: Hotjar + Optimizely (client has licences).',
    jekbee_margin_percent: 32
  }})

  const gtsSocial = await prisma.engagement.create({ data: {
    client_id: gts.id, title: 'GTS Logistics LinkedIn & Social Ads', type: 'AdCampaign', service: 'SocialAds', status: 'Active',
    start_date: new Date('2026-02-01'), end_date: new Date('2026-07-31'),
    brief: 'Social advertising retainer for GTS Logistics UK. Primary channel: LinkedIn (targeting supply chain managers, logistics directors, procurement leads). Secondary: Facebook/Instagram for brand awareness. Monthly deliverables: 4 LinkedIn ad creatives, 2 Facebook campaigns, monthly performance report. Budget: £5,000/month LinkedIn, £2,000/month Meta.',
    jekbee_margin_percent: 30
  }})

  const gtsOrganic = await prisma.engagement.create({ data: {
    client_id: gts.id, title: 'GTS Logistics Organic Social', type: 'Retainer', service: 'OrganicSocial', status: 'Active',
    start_date: new Date('2026-01-01'), end_date: new Date('2026-12-31'),
    brief: 'Organic social media management for GTS Logistics. Channels: LinkedIn (primary), Twitter/X, Facebook. Monthly: 12 LinkedIn posts, 8 Twitter posts, 4 Facebook posts. Content themes: industry news commentary, company culture, case studies, thought leadership. Tone: professional, authoritative, slightly human.',
    jekbee_margin_percent: 30
  }})

  // FreelancerEngagements
  await prisma.freelancerEngagement.create({ data: {
    freelancer_id: alice.id, engagement_id: jwSEO.id,
    days_allocated: 8, scheduled_start: new Date('2026-03-01'), scheduled_end: new Date('2026-03-31'),
    freelancer_brief: 'This month: complete the technical audit actions backlog (carry over 3 from Feb). Deliver 4 content briefs for the protein category. Outreach to 10 food/health link prospects. Weekly update call Thursdays 10am.',
    status: 'InProgress'
  }})

  await prisma.freelancerEngagement.create({ data: {
    freelancer_id: jamie.id, engagement_id: jwDesign.id,
    days_allocated: 12, scheduled_start: new Date('2026-02-15'), scheduled_end: new Date('2026-04-10'),
    freelancer_brief: 'Design 6 landing page layouts. Start with the homepage hero and tinned tuna category page. Use the approved brand deck (shared in Notion). Deliver Figma files with component library. Client review scheduled for March 20th.',
    status: 'InProgress'
  }})

  await prisma.freelancerEngagement.create({ data: {
    freelancer_id: marcus.id, engagement_id: keyperPPC.id,
    days_allocated: 6, scheduled_start: new Date('2026-03-01'), scheduled_end: new Date('2026-03-31'),
    freelancer_brief: 'March focus: optimise non-branded search campaigns. Negative keyword audit. Test 3 new ad copy variants for demo request CTA. Review display remarketing audiences and refresh creatives. Deliver monthly report by March 28th.',
    status: 'InProgress'
  }})

  await prisma.freelancerEngagement.create({ data: {
    freelancer_id: priya.id, engagement_id: gtsSocial.id,
    days_allocated: 5, scheduled_start: new Date('2026-03-01'), scheduled_end: new Date('2026-03-31'),
    freelancer_brief: 'March: deliver 4 LinkedIn campaign setups (targeting specs in brief doc). Refresh Meta creative sets with new GTS photography. Set up LinkedIn Lead Gen forms for the freight forwarding campaign. Report due March 31.',
    status: 'InProgress'
  }})

  await prisma.freelancerEngagement.create({ data: {
    freelancer_id: ben.id, engagement_id: gtsOrganic.id,
    days_allocated: 4, scheduled_start: new Date('2026-03-01'), scheduled_end: new Date('2026-03-31'),
    freelancer_brief: 'Content calendar for March: 12 LinkedIn posts, 8 Twitter, 4 Facebook. Themes this month: Women in Logistics (International Womens Day), Q1 industry wrap-up, 2 case study posts (Brighton warehouse, Edinburgh depot). Copy due to Sarah by March 10 for review.',
    status: 'Delivered'
  }})

  await prisma.freelancerEngagement.create({ data: {
    freelancer_id: sofia.id, engagement_id: keyperCRO.id,
    days_allocated: 8, scheduled_start: new Date('2026-04-01'), scheduled_end: new Date('2026-05-10'),
    freelancer_brief: 'CRO sprint: start with full Hotjar session recording review (2 days). Produce heatmap report. Develop 2 test hypotheses for homepage hero and demo form. Implement via Optimizely (client IT will assist with snippet install). Report results at end of sprint.',
    status: 'Briefed'
  }})

  // Check-ins
  await prisma.weeklyCheckIn.create({ data: {
    freelancer_id: alice.id,
    date: new Date('2026-03-13'),
    attendees: 'Sarah Mitchell, Alice Chen',
    notes: 'Alice is on track with content briefs — 3 of 4 delivered. Technical audit actions progressing well, 2 of 3 carry-overs completed. Link outreach started, 4 prospects contacted so far. No blockers. Slight concern about client responsiveness on content approvals — Sarah to chase.',
    action_items: JSON.stringify([
      { item: 'Sarah to chase John West content approvals', owner: 'Sarah Mitchell', due_date: '2026-03-15', completed: true },
      { item: 'Alice to complete 4th content brief', owner: 'Alice Chen', due_date: '2026-03-17', completed: false },
      { item: 'Alice to send link outreach update', owner: 'Alice Chen', due_date: '2026-03-20', completed: false }
    ])
  }})

  await prisma.weeklyCheckIn.create({ data: {
    freelancer_id: marcus.id,
    date: new Date('2026-03-14'),
    attendees: 'Tom Reynolds, Marcus Webb',
    notes: 'Marcus has run the negative keyword audit — found 180 irrelevant terms. CPL for March tracking at £98 so far (good vs £120 target). New ad copy variants live and getting early positive signals. Display remarketing audiences refreshed.',
    action_items: JSON.stringify([
      { item: 'Marcus to compile ad copy test results mid-month', owner: 'Marcus Webb', due_date: '2026-03-21', completed: false },
      { item: 'Tom to request updated creative assets from client', owner: 'Tom Reynolds', due_date: '2026-03-17', completed: false }
    ])
  }})

  await prisma.weeklyCheckIn.create({ data: {
    freelancer_id: ben.id,
    date: new Date('2026-03-10'),
    attendees: 'Sarah Mitchell, Ben Carter',
    notes: 'Ben delivered full content calendar ahead of schedule. All copy reviewed and approved by Sarah. Case study posts need one more round of client sign-off (GTS internal comms team). Otherwise March deliverables are complete. Discussion about expanding scope to include Instagram Reels from April.',
    action_items: JSON.stringify([
      { item: 'GTS to sign off case study posts', owner: 'Sarah Mitchell', due_date: '2026-03-18', completed: false },
      { item: 'Ben to draft Instagram Reels content proposal', owner: 'Ben Carter', due_date: '2026-03-24', completed: false },
      { item: 'Sarah to get GTS sign-off on Reels scope expansion', owner: 'Sarah Mitchell', due_date: '2026-03-28', completed: false }
    ])
  }})

  console.log('Seed data created successfully')
}

main().catch(console.error).finally(() => prisma.$disconnect())
