import { TableRow } from "@/lib/tsdb";

function GroupTable({ group, rows }: { group: string; rows: TableRow[] }) {
  return (
    <div className="panel-strong glow rounded-2xl p-3">
      <div className="dot text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>
        Group {group}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="dot text-xs" style={{ color: "var(--muted)" }}>
            <th className="py-1 pr-2">#</th>
            <th className="py-1 pr-2">Team</th>
            <th className="py-1 pr-2">P</th>
            <th className="py-1 pr-2">W</th>
            <th className="py-1 pr-2">D</th>
            <th className="py-1 pr-2">L</th>
            <th className="py-1 pr-2">GD</th>
            <th className="py-1">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.teamid} className="border-t border-[rgba(255,255,255,0.06)]">
              <td className="py-1 pr-2 dot text-xs" style={{ color: "var(--muted)" }}>{idx + 1}</td>
              <td className="py-1 pr-2 text-xs leading-snug">{r.name}</td>
              <td className="py-1 pr-2 dot text-xs" style={{ color: "var(--muted)" }}>{r.played}</td>
              <td className="py-1 pr-2 dot text-xs" style={{ color: "var(--muted)" }}>{r.win}</td>
              <td className="py-1 pr-2 dot text-xs" style={{ color: "var(--muted)" }}>{r.draw}</td>
              <td className="py-1 pr-2 dot text-xs" style={{ color: "var(--muted)" }}>{r.loss}</td>
              <td className="py-1 pr-2 dot text-xs" style={{ color: "var(--muted)" }}>{r.goalsdifference}</td>
              <td className="py-1 dot text-xs font-semibold" style={{ color: "var(--accent)" }}>{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GroupTableView({ rows }: { rows: TableRow[] }) {
  const groups: Record<string, TableRow[]> = {};
  for (const row of rows) {
    const g = row.strGroup || "";
    if (!g) continue;
    if (!groups[g]) groups[g] = [];
    groups[g].push(row);
  }

  const groupKeys = Object.keys(groups).sort();
  const hasGroupData = groupKeys.length > 1;

  return (
    <div className="panel glow rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="dot text-sm sm:text-base" style={{ color: "var(--muted)" }}>Group Stage</h2>
        {hasGroupData && (
          <div className="dot text-xs" style={{ color: "var(--muted)" }}>{groupKeys.length} groups</div>
        )}
      </div>

      {hasGroupData ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groupKeys.map((g) => (
            <GroupTable key={g} group={g} rows={groups[g]} />
          ))}
        </div>
      ) : rows.length > 0 ? (
        // Fallback: flat table if TheSportsDB doesn't return group data
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
                <td className="py-2 pr-3 text-sm leading-snug">{r.name}</td>
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
      ) : (
        <div className="rounded-2xl panel-strong glow px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
          Groups not available yet.
        </div>
      )}
    </div>
  );
}
