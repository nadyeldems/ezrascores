"use client";

import { Player, Team } from "@/lib/tsdb";

const POSITION_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

function normalisePosition(pos?: string): string {
  if (!pos) return "Other";
  const p = pos.toLowerCase();
  if (p.includes("goalkeeper") || p === "gk") return "Goalkeeper";
  if (p.includes("defender") || p === "cb" || p === "lb" || p === "rb") return "Defender";
  if (p.includes("midfielder") || p === "cm" || p === "dm" || p === "am") return "Midfielder";
  if (p.includes("forward") || p.includes("winger") || p === "st" || p === "cf") return "Forward";
  return "Other";
}

export function SquadView({ players, team }: { players: Player[]; team: Team | null }) {
  if (!team) {
    return (
      <div className="panel glow rounded-2xl px-4 py-8 text-sm text-center" style={{ color: "var(--muted)" }}>
        Pick a favourite team to see their squad.
      </div>
    );
  }

  const byPosition: Record<string, Player[]> = {};
  for (const p of players) {
    const pos = normalisePosition(p.strPosition);
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(p);
  }

  const sections = [
    ...POSITION_ORDER.filter((p) => byPosition[p]?.length),
    ...(byPosition["Other"]?.length ? ["Other"] : []),
  ];

  return (
    <div className="panel glow rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="dot text-sm sm:text-base" style={{ color: "var(--muted)" }}>
          Squad • {team.strTeam}
        </h2>
        <div className="dot text-xs" style={{ color: "var(--muted)" }}>
          {players.length} players
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-2xl panel-strong glow px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
          Squad data not available.
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((pos) => (
            <div key={pos}>
              <div className="dot text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>
                {pos}s
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {byPosition[pos].map((p) => (
                  <div key={p.idPlayer} className="flex items-center gap-2 panel-strong glow rounded-xl px-3 py-2">
                    {p.strThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.strThumb}
                        alt={p.strPlayer}
                        className="h-9 w-9 rounded-lg object-cover bg-black/25 shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-lg bg-black/25 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-snug truncate">{p.strPlayer}</div>
                      {p.strNationality && (
                        <div className="dot text-xs truncate" style={{ color: "var(--muted)" }}>
                          {p.strNationality}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
