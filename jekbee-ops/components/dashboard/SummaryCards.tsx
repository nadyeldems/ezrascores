interface SummaryCardsProps {
  activeClients: number
  activeEngagements: number
  activeFreelancers: number
  totalOutcostThisMonth: number
}

export function SummaryCards({
  activeClients,
  activeEngagements,
  activeFreelancers,
  totalOutcostThisMonth,
}: SummaryCardsProps) {
  const cards = [
    {
      label: 'Active Clients',
      value: activeClients,
      format: 'number',
      amber: false,
    },
    {
      label: 'Active Engagements',
      value: activeEngagements,
      format: 'number',
      amber: false,
    },
    {
      label: 'Active Freelancers',
      value: activeFreelancers,
      format: 'number',
      amber: false,
    },
    {
      label: 'Total Outcost This Month',
      value: totalOutcostThisMonth,
      format: 'currency',
      amber: true,
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-lg border p-4 ${
            card.amber
              ? 'bg-amber-400/10 border-amber-400/40'
              : 'bg-dark-700 border-dark-500'
          }`}
        >
          <p className="text-xs text-white/40 uppercase tracking-wide font-mono mb-2">
            {card.label}
          </p>
          <p
            className={`text-2xl font-mono font-bold ${
              card.amber ? 'text-amber-400' : 'text-white'
            }`}
          >
            {card.format === 'currency'
              ? `£${card.value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
              : card.value}
          </p>
        </div>
      ))}
    </div>
  )
}
