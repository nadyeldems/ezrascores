'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

interface FreelancerRow {
  id: string
  name: string
  discipline: string
  daysAllocated: number
  dayRate: number
}

interface OutcostPanelProps {
  freelancers: FreelancerRow[]
  initialMarginPercent: number
  engagementId: string
  engagementTitle: string
  clientName: string
}

export function OutcostPanel({
  freelancers,
  initialMarginPercent,
  engagementId,
  engagementTitle,
  clientName,
}: OutcostPanelProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [marginPercent, setMarginPercent] = useState(initialMarginPercent)
  const [editingMargin, setEditingMargin] = useState(false)
  const [marginInput, setMarginInput] = useState(String(initialMarginPercent))

  const totalFreelancerCost = freelancers.reduce(
    (sum, f) => sum + f.daysAllocated * f.dayRate,
    0
  )
  const jekbeeMarginGBP =
    totalFreelancerCost / (1 - marginPercent / 100) - totalFreelancerCost
  const totalEngagementValue = totalFreelancerCost + jekbeeMarginGBP

  const handleMarginSave = () => {
    const val = parseFloat(marginInput)
    if (!isNaN(val) && val >= 0 && val < 100) {
      setMarginPercent(val)
    }
    setEditingMargin(false)
  }

  const handlePrint = () => {
    const printContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Outcost — ${engagementTitle}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 40px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 13px; margin-bottom: 32px; }
    .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; padding: 8px 12px; border-bottom: 2px solid #e5e5e5; }
    td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .mono { font-family: 'Consolas', 'Courier New', monospace; }
    .totals { background: #f9f9f9; border-top: 2px solid #e5e5e5; }
    .totals td { font-weight: 600; }
    .total-value { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .internal { font-size: 10px; color: #ccc; margin-top: 48px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <p class="label">JEKBEE — Confidential</p>
  <h1>${engagementTitle}</h1>
  <p class="subtitle">Client: ${clientName} &nbsp;&middot;&nbsp; Outcost Summary</p>

  <table>
    <thead>
      <tr>
        <th>Freelancer</th>
        <th>Discipline</th>
        <th class="mono">Days</th>
        <th class="mono">Day Rate</th>
        <th class="mono">Cost</th>
      </tr>
    </thead>
    <tbody>
      ${freelancers
        .map(
          (f) => `
      <tr>
        <td>${f.name}</td>
        <td>${f.discipline}</td>
        <td class="mono">${f.daysAllocated}</td>
        <td class="mono">£${f.dayRate.toLocaleString('en-GB')}</td>
        <td class="mono">£${(f.daysAllocated * f.dayRate).toLocaleString('en-GB')}</td>
      </tr>`
        )
        .join('')}
    </tbody>
    <tfoot class="totals">
      <tr>
        <td colspan="4">Total Freelancer Cost</td>
        <td class="mono">£${totalFreelancerCost.toLocaleString('en-GB')}</td>
      </tr>
      <tr>
        <td colspan="4">JEKBEE Margin (${marginPercent}%)</td>
        <td class="mono">£${jekbeeMarginGBP.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
      </tr>
      <tr>
        <td colspan="4"><strong>Total Engagement Value</strong></td>
        <td class="mono total-value">£${totalEngagementValue.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
      </tr>
    </tfoot>
  </table>

  <p class="internal">JEKBEE Internal Use Only — Not for client distribution</p>

  <script>window.print(); window.close();</script>
</body>
</html>`
    const win = window.open('', '_blank', 'width=800,height=600')
    if (win) {
      win.document.write(printContent)
      win.document.close()
    }
  }

  return (
    <div className="bg-dark-900 border border-amber-400/40 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-amber-400/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">
            JEKBEE FINANCIALS — INTERNAL
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-amber-400/60 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-amber-400/20">
          {freelancers.length === 0 ? (
            <div className="px-5 py-8 text-center text-white/30 text-sm">
              No freelancers assigned yet
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-amber-400/10">
                    <th className="px-5 py-2.5 text-left text-xs text-amber-400/50 font-mono uppercase">Freelancer</th>
                    <th className="px-5 py-2.5 text-left text-xs text-amber-400/50 font-mono uppercase">Discipline</th>
                    <th className="px-5 py-2.5 text-right text-xs text-amber-400/50 font-mono uppercase">Days</th>
                    <th className="px-5 py-2.5 text-right text-xs text-amber-400/50 font-mono uppercase">Day Rate</th>
                    <th className="px-5 py-2.5 text-right text-xs text-amber-400/50 font-mono uppercase">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {freelancers.map((f) => (
                    <tr key={f.id} className="border-b border-amber-400/10">
                      <td className="px-5 py-3 text-sm text-white">{f.name}</td>
                      <td className="px-5 py-3">
                        <Badge label={f.discipline} variant="service" />
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-mono text-white/70">
                        {f.daysAllocated}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-mono text-amber-400">
                        £{f.dayRate.toLocaleString('en-GB')}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-mono text-white">
                        £{(f.daysAllocated * f.dayRate).toLocaleString('en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals section */}
              <div className="border-t border-amber-400/20 px-5 py-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-mono text-white/40 uppercase">Total Freelancer Cost</span>
                  <span className="text-sm font-mono text-white">
                    £{totalFreelancerCost.toLocaleString('en-GB')}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-white/40 uppercase">JEKBEE Margin</span>
                    <div className="flex items-center gap-1">
                      {editingMargin ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            max="99"
                            step="0.5"
                            value={marginInput}
                            onChange={(e) => setMarginInput(e.target.value)}
                            onBlur={handleMarginSave}
                            onKeyDown={(e) => e.key === 'Enter' && handleMarginSave()}
                            className="w-16 bg-dark-600 border border-amber-400/40 text-amber-400 text-xs font-mono px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-400/60"
                            autoFocus
                          />
                          <span className="text-xs font-mono text-amber-400">%</span>
                        </>
                      ) : (
                        <button
                          onClick={() => { setEditingMargin(true); setMarginInput(String(marginPercent)) }}
                          className="text-xs font-mono text-amber-400 hover:text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded hover:border-amber-400/60 transition-colors"
                        >
                          {marginPercent}%
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-mono text-amber-400">
                    £{jekbeeMarginGBP.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-amber-400/20">
                  <span className="text-xs font-mono text-amber-400 uppercase font-bold">Total Engagement Value</span>
                  <span className="text-lg font-mono font-bold text-amber-400">
                    £{totalEngagementValue.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-amber-400/20 px-5 py-3 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrint}
                >
                  <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Generate Outcost Document
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
