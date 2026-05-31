export type LeagueKey = "EPL" | "CHAMP" | "WC";

export type LeagueMeta = {
  id: string;
  name: string;
  shortName: string;
  type: "league" | "tournament";
  season?: string;
};

export const LEAGUES: Record<LeagueKey, LeagueMeta> = {
  EPL:   { id: "4328", name: "English Premier League",    shortName: "EPL",      type: "league" },
  CHAMP: { id: "4329", name: "English League Championship", shortName: "CHAMP",  type: "league" },
  WC:    { id: "4429", name: "FIFA World Cup",             shortName: "WC 2026", type: "tournament", season: "2026-2027" },
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
  strTimestampUTC?: string;
  strVenue?: string;
  strLeague?: string;
  strRound?: string;

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
  strGroup?: string;
};

export type Player = {
  idPlayer: string;
  strPlayer: string;
  strPosition?: string;
  strNationality?: string;
  strThumb?: string;
  strNumber?: string;
};

export type Prediction = {
  home: number;
  away: number;
};

const PRED_PREFIX = "esraScores:pred:";

export function getPrediction(eventId: string): Prediction | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(`${PRED_PREFIX}${eventId}`);
    return v ? (JSON.parse(v) as Prediction) : null;
  } catch { return null; }
}

export function savePrediction(eventId: string, pred: Prediction) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${PRED_PREFIX}${eventId}`, JSON.stringify(pred));
  } catch {}
}

export function predictionPoints(pred: Prediction, event: Event): number | null {
  const hs = event.intHomeScore;
  const as = event.intAwayScore;
  if (hs == null || hs === "" || as == null || as === "") return null;
  const rh = parseInt(hs, 10);
  const ra = parseInt(as, 10);
  if (isNaN(rh) || isNaN(ra)) return null;
  if (pred.home === rh && pred.away === ra) return 3;
  if (Math.sign(pred.home - pred.away) === Math.sign(rh - ra)) return 1;
  return 0;
}

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

export type TsdbEndpoint =
  | "eventsday"
  | "lookuptable"
  | "livescore"
  | "searchteams"
  | "lookupteam"
  | "eventsnext"
  | "lookupsquad";

export async function tsdbFetch<T>(
  endpoint: TsdbEndpoint,
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

const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
};

export function localTime(event: Event): string | undefined {
  // Prefer strTimestampUTC — reliable UTC from TheSportsDB, no DST ambiguity.
  if (event.strTimestampUTC) {
    const raw = event.strTimestampUTC.trim().replace(" ", "T");
    const iso = raw.endsWith("Z") ? raw : raw + "Z";
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-GB", TIME_FMT);
  }
  if (event.strTimestamp) {
    const d = new Date(event.strTimestamp);
    if (!isNaN(d.getTime())) return d.toLocaleTimeString("en-GB", TIME_FMT);
  }
  // strTime is already UK local time — return it directly without UTC conversion.
  return event.strTime?.slice(0, 5) || event.strTime;
}

export function formatKickoff(dateYMD?: string, time?: string) {
  if (!dateYMD) return "TBC";
  const t = (time || "").trim();
  return t ? `${dateYMD} • ${t}` : dateYMD;
}

export function homeAwayLabel(event: Event, favTeamId: string) {
  if (event.idHomeTeam === favTeamId) return "Home";
  if (event.idAwayTeam === favTeamId) return "Away";
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

export function isMatchPlayed(event: Event): boolean {
  const s = (event.strStatus || "").toLowerCase();
  if (s.includes("finish") || s === "ft" || s === "aet" || s === "pen") return true;
  const hs = event.intHomeScore;
  const as = event.intAwayScore;
  return hs != null && hs !== "" && as != null && as !== "";
}
