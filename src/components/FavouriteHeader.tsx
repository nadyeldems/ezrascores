"use client";

import { Event, Team, formatKickoff, homeAwayLabel, isToday, localTime, opponentName, safeTeamBadge } from "@/lib/tsdb";

export function FavouriteHeader({
  team,
  nextEvent,
  liveEvent,
  onChangeFavourite,
  mode = "club",
}: {
  team: Team | null;
  nextEvent: Event | null;
  liveEvent: Event | null;
  onChangeFavourite: () => void;
  mode?: "club" | "nation";
}) {
  const label = mode === "nation" ? "Favourite Nation" : "Favourite Team";
  const choosePrompt = mode === "nation"
    ? "Choose your nation for the World Cup"
    : "Choose your team to pin it here";
  const chooseHint = mode === "nation"
    ? "Flag, next fixture, and live scores will stay pinned here."
    : "Badge, next fixture, and live scores will stay at the very top.";

  if (!team) {
    return (
      <div className="panel glow rounded-2xl p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="dot text-xs" style={{ color: "var(--muted)" }}>{label}</div>
            <div className="mt-1 text-lg sm:text-xl font-semibold">{choosePrompt}</div>
            <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{chooseHint}</div>
          </div>
          <button
            onClick={onChangeFavourite}
            className="dot rounded-xl px-3 py-2 text-xs sm:text-sm panel-strong glow border border-[rgba(255,255,255,0.12)]"
          >
            Choose
          </button>
        </div>
      </div>
    );
  }

  const badge = safeTeamBadge(team);
  const gameDay = nextEvent && isToday(nextEvent.dateEvent);
  const nextLine = nextEvent
    ? `${homeAwayLabel(nextEvent, team.idTeam)} vs ${opponentName(nextEvent, team.idTeam)}`
    : "Next fixture: TBC";
  const kickoff = nextEvent ? formatKickoff(nextEvent.dateEvent, localTime(nextEvent)) : "TBC";

  const liveScore =
    liveEvent && (liveEvent.intHomeScore || liveEvent.intAwayScore)
      ? `${liveEvent.strHomeTeam} ${liveEvent.intHomeScore ?? ""} - ${liveEvent.intAwayScore ?? ""} ${liveEvent.strAwayTeam}`
      : "";

  return (
    <div className="panel glow rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0">
            {badge ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={badge}
                alt={`${team.strTeam} badge`}
                className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl panel-strong p-1"
              />
            ) : (
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl panel-strong" />
            )}
          </div>

          <div className="min-w-0">
            <div className="dot text-xs mb-1" style={{ color: "var(--muted)" }}>{label}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-lg sm:text-2xl font-semibold leading-tight">{team.strTeam}</div>
              {gameDay && (
                <div
                  className="dot text-xs sm:text-sm flash px-2 py-1 rounded-xl"
                  style={{ color: "var(--accent)", border: "1px solid rgba(255,122,24,0.5)", background: "rgba(255,122,24,0.08)" }}
                >
                  Game Day
                </div>
              )}
            </div>

            <div className="mt-1 text-sm sm:text-base leading-snug">{nextLine}</div>

            <div className="dot mt-1 text-xs sm:text-sm" style={{ color: "var(--muted)" }}>
              {nextEvent?.strVenue ? `${nextEvent.strVenue} • ` : ""}{kickoff}
            </div>

            {liveScore && (
              <div className="dot mt-2 text-xs sm:text-sm" style={{ color: "var(--cyan)" }}>
                Live: {liveScore}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onChangeFavourite}
          className="dot rounded-xl px-3 py-2 text-xs sm:text-sm panel-strong glow border border-[rgba(255,255,255,0.12)] shrink-0"
          title={`Change ${label.toLowerCase()}`}
        >
          Change
        </button>
      </div>
    </div>
  );
}
