export type LeagueKey = "EPL" | "CHAMP";

export const LEAGUES: Record<LeagueKey, { id: string; name: string }> = {
  EPL: { id: "4328", name: "English Premier League" },
  CHAMP: { id: "4329", name: "English League Championship" },
};

export type Team = {
  idTeam: string;
  strTeam: string;
  strTeamBadge?: string;
  strTeamLogo?: string;
};

export type Event = {
  idEvent: string;
  strEvent: string;
  dateEvent?: string;
  strTime?: string;
  strTimestamp?: string;
  strVenue?: string;
  strLeague?: string;

  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;

  intHomeScore?: string;
  intAwayScore?: string;

  strStatus?: string;
};

export type TableRow = {
  name: string;
  teamid: string;
  played: string;
  win: string;
  draw: string;
  loss: string;
  goalsfor: string;
  goalsagainst: string;
  goalsdifference: string;
  total: string;
};

function toYMD(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getDateBuckets() {
  const now = new Date();
  const yday = new Date(now);
  yday.setDate(now.getDate() - 1);
  const tmrw = new Date(now);
  tmrw.setDate(now.getDate() + 1);

  return {
    yesterday: toYMD(yday),
    today: toYMD(now),
    tomorrow: toYMD(tmrw),
  };
}

export async function tsdbFetch<T>(
  endpoint: "eventsday" | "lookuptable" | "livescore" | "searchteams" | "lookupteam" | "eventsnext",
  params: Record<string, string>
): Promise<T> {
  const url = new URL("/api/tsdb", window.location.origin);
  url.searchParams.set("endpoint", endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function isToday(dateYMD?: string) {
  if (!dateYMD) return false;
  const { today } = getDateBuckets();
  return dateYMD === today;
}

export function localTime(event: Event): string | undefined {
  if (event.strTimestamp) {
    const d = new Date(event.strTimestamp);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }
  if (event.strTime && event.dateEvent) {
    const t = event.strTime.trim();
    const iso = t.includes("+") || t.endsWith("Z")
      ? `${event.dateEvent}T${t}`
      : `${event.dateEvent}T${t}Z`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }
  return event.strTime;
}

export function formatKickoff(dateYMD?: string, time?: string) {
  if (!dateYMD) return "TBC";
  const t = (time || "").trim();
  return t ? `${dateYMD} • ${t}` : dateYMD;
}

export function homeAwayLabel(event: Event, favTeamId: string) {
  const isHome = event.idHomeTeam === favTeamId;
  const isAway = event.idAwayTeam === favTeamId;
  if (isHome) return "Home";
  if (isAway) return "Away";
  return "";
}

export function opponentName(event: Event, favTeamId: string) {
  const isHome = event.idHomeTeam === favTeamId;
  if (isHome) return event.strAwayTeam || "TBC";
  return event.strHomeTeam || "TBC";
}

export function safeTeamBadge(team?: Team | null) {
  return team?.strTeamBadge || team?.strTeamLogo || "";
}
