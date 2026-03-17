# JEKBEE Ops — Internal Team Management Tool

Internal operations tool for JEKBEE digital marketing agency. Manages clients, engagements, freelancers, check-ins, and weekly planning.

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Prisma** + PostgreSQL
- **Tailwind CSS** (JEKBEE dark theme)
- **React Hook Form** + Zod
- **TanStack Table**

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL connection string.

### 3. Set up the database

```bash
npm run db:push
npm run db:seed
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Commands

| Command | Description |
|---|---|
| `npm run db:push` | Push schema to DB (no migration file) |
| `npm run db:migrate` | Create and run migration |
| `npm run db:seed` | Seed with sample data |
| `npm run db:studio` | Open Prisma Studio |

## Project Structure

```
jekbee-ops/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── clients/           # Client pages
│   ├── engagements/       # Engagement pages
│   ├── freelancers/       # Freelancer pages
│   ├── checkins/          # Check-in pages
│   ├── planning/          # Weekly planning grid
│   └── page.tsx           # Dashboard
├── components/
│   ├── ui/                # Base UI components
│   ├── layout/            # Sidebar, TopBar
│   ├── dashboard/         # Dashboard widgets
│   ├── engagements/       # Engagement-specific
│   ├── checkins/          # Check-in components
│   └── planning/          # Planning grid
├── lib/
│   ├── prisma.ts          # Prisma singleton
│   └── types.ts           # Shared TypeScript types
└── prisma/
    ├── schema.prisma      # Database schema
    └── seed.ts            # Seed data
```

## Internal Use Only

This tool contains sensitive commercial data including freelancer day rates and client financials. Do not share access externally.
