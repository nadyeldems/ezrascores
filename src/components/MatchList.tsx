import { Event, localTime } from "@/lib/tsdb";

function scoreLine(e: Event) {
  const hs = e.intHomeScore;
  const as = e.intAwayScore;
  if (hs == null || as == null || hs === "" || as === "") return "";
  return `${hs} - ${as}`;
}

function statusLine(e: Event) {
  const s = (e.strStatus || "").trim();
  if (!s) return "";
  return s;
}

export function MatchList({ title, events, onPick }: { title: string; events: Event[]; onPick?: (e: Event) => void }) {
  return (
    <div className="panel glow rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="dot text-sm sm:text-base" style={{ color: "var(--muted)" }}>{title}</h2>
        <div className="dot text-xs" style={{ color: "var(--muted)" }}>
          {events.length} match{events.length === 1 ? "" : "es"}
        </div>
      </div>

      <div className="space-y-2">
        {events.map((e) => (
          <button
            key={e.idEvent}
            onClick={() => onPick?.(e)}
            className="w-full text-left rounded-2xl panel-strong glow px-3 py-3 sm:px-4 sm:py-4"
          >
            <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
              <div className="min-w-0">
                <div className="dot text-xs sm:text-sm" style={{ color: "var(--muted)" }}>
                  {(e.dateEvent || "TBC")}{localTime(e) ? ` • ${localTime(e)}` : ""}{e.strVenue ? ` • ${e.strVenue}` : ""}
                </div>

                <div className="mt-1 text-sm sm:text-base leading-snug">
                  <span className="font-semibold">{e.strHomeTeam || "TBC"}</span>
                  <span className="mx-2" style={{ color: "var(--muted)" }}>vs</span>
                  <span className="font-semibold">{e.strAwayTeam || "TBC"}</span>
                </div>

                {statusLine(e) ? (
                  <div className="dot mt-1 text-xs" style={{ color: "var(--cyan)" }}>
                    {statusLine(e)}
                  </div>
                ) : null}
              </div>

              <div className="dot text-sm sm:text-base whitespace-nowrap" style={{ color: "var(--accent)" }}>
                {scoreLine(e)}
              </div>
            </div>
          </button>
        ))}

        {events.length === 0 ? (
          <div className="rounded-2xl panel-strong glow px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
            No matches found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
