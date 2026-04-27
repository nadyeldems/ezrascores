import { TableRow } from "@/lib/tsdb";

export function TableView({ rows }: { rows: TableRow[] }) {
  return (
    <div className="panel glow rounded-2xl p-3 sm:p-4 overflow-x-auto">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="dot text-sm sm:text-base" style={{ color: "var(--muted)" }}>League Table</h2>
        <div className="dot text-xs" style={{ color: "var(--muted)" }}>Updated via API</div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="dot text-xs" style={{ color: "var(--muted)" }}>
            <th className="py-2 pr-3">#</th>
            <th className="py-2 pr-3">Team</th>
            <th className="py-2 pr-3">P</th>
            <th className="py-2 pr-3">W</th>
            <th className="py-2 pr-3">D</th>
            <th className="py-2 pr-3">L</th>
            <th className="py-2 pr-3">GD</th>
            <th className="py-2 pr-3">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.teamid} className="border-t border-[rgba(255,255,255,0.08)]">
              <td className="py-2 pr-3 dot text-xs" style={{ color: "var(--muted)" }}>{idx + 1}</td>
              <td className="py-2 pr-3 text-sm sm:text-base leading-snug">{r.name}</td>
              <td className="py-2 pr-3 dot text-xs" style={{ color: "var(--muted)" }}>{r.played}</td>
              <td className="py-2 pr-3 dot text-xs" style={{ color: "var(--muted)" }}>{r.win}</td>
              <td className="py-2 pr-3 dot text-xs" style={{ color: "var(--muted)" }}>{r.draw}</td>
              <td className="py-2 pr-3 dot text-xs" style={{ color: "var(--muted)" }}>{r.loss}</td>
              <td className="py-2 pr-3 dot text-xs" style={{ color: "var(--muted)" }}>{r.goalsdifference}</td>
              <td className="py-2 pr-3 dot text-sm" style={{ color: "var(--accent)" }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-2xl panel-strong glow px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
          Table not available right now.
        </div>
      ) : null}
    </div>
  );
}
