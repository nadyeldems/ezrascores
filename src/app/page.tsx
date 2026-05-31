"use client";

import { FavouriteHeader } from "@/components/FavouriteHeader";
import { GroupTableView } from "@/components/GroupTableView";
import { LeagueTabs } from "@/components/LeagueTabs";
import { MatchList } from "@/components/MatchList";
import { PredictionsView } from "@/components/PredictionsView";
import { SquadView } from "@/components/SquadView";
import { TableView } from "@/components/TableView";
import { TeamPicker } from "@/components/TeamPicker";
import {
  LEAGUES,
  LeagueKey,
  Player,
  Team,
  Event,
  TableRow,
  getDateBuckets,
  tsdbFetch,
} from "@/lib/tsdb";
import { useEffect, useMemo, useState } from "react";
import { ViewKey, ViewTabs } from "@/components/ViewTabs";

type EventsDayResponse   = { events: Event[] | null };
type LiveResponse        = { events: Event[] | null; match: Event[] | null };
type TableResponse       = { table: TableRow[] | null };
type LookupTeamResponse  = { teams: Team[] | null };
type NextEventsResponse  = { events: Event[] | null };
type SquadResponse       = { player: Player[] | null };

const LS_FAV_CLUB   = "esraScores:favouriteTeamId";
const LS_FAV_NATION = "esraScores:favouriteNationId";

export default function Home() {
  const [league, setLeague] = useState<LeagueKey>("EPL");
  const [view, setView]     = useState<ViewKey>("TODAY");

  // Club favourite (EPL / CHAMP)
  const [favClubId,   setFavClubId]   = useState<string | null>(null);
  const [favClub,     setFavClub]     = useState<Team | null>(null);
  const [nextClubEvent, setNextClubEvent] = useState<Event | null>(null);

  // Nation favourite (WC)
  const [favNationId,   setFavNationId]   = useState<string | null>(null);
  const [favNation,     setFavNation]     = useState<Team | null>(null);
  const [nextNationEvent, setNextNationEvent] = useState<Event | null>(null);

  // Live event for the active favourite
  const [liveEventForFav, setLiveEventForFav] = useState<Event | null>(null);

  // Main content state
  const [events,  setEvents]  = useState<Event[]>([]);
  const [table,   setTable]   = useState<TableRow[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [loading,       setLoading]       = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  // Picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"club" | "nation">("club");

  const buckets    = useMemo(() => getDateBuckets(), []);
  const leagueMeta = LEAGUES[league];
  const isTournament = leagueMeta.type === "tournament";

  // Active favourite depends on current league type
  const activeFavId   = isTournament ? favNationId  : favClubId;
  const activeFav     = isTournament ? favNation     : favClub;
  const activeNextEvt = isTournament ? nextNationEvent : nextClubEvent;

  // ── Load favourites from localStorage ──────────────────────────────
  useEffect(() => {
    const club   = localStorage.getItem(LS_FAV_CLUB);
    const nation = localStorage.getItem(LS_FAV_NATION);
    if (club)   setFavClubId(club);
    if (nation) setFavNationId(nation);
  }, []);

  // ── Fetch club favourite data ───────────────────────────────────────
  useEffect(() => {
    if (!favClubId) { setFavClub(null); setNextClubEvent(null); return; }
    (async () => {
      try {
        const tData = await tsdbFetch<LookupTeamResponse>("lookupteam", { id: favClubId });
        setFavClub(tData.teams?.[0] || null);
        const nData = await tsdbFetch<NextEventsResponse>("eventsnext", { id: favClubId });
        setNextClubEvent(nData.events?.[0] || null);
      } catch {}
    })();
  }, [favClubId]);

  // ── Fetch nation favourite data ─────────────────────────────────────
  useEffect(() => {
    if (!favNationId) { setFavNation(null); setNextNationEvent(null); return; }
    (async () => {
      try {
        const tData = await tsdbFetch<LookupTeamResponse>("lookupteam", { id: favNationId });
        setFavNation(tData.teams?.[0] || null);
        const nData = await tsdbFetch<NextEventsResponse>("eventsnext", { id: favNationId });
        setNextNationEvent(nData.events?.[0] || null);
      } catch {}
    })();
  }, [favNationId]);

  // ── Main data refresh ───────────────────────────────────────────────
  async function refreshAll() {
    setLoading(true);
    setError(null);

    try {
      const lId = leagueMeta.id;

      // Always fetch live scores (needed for fav live badge)
      const liveData   = await tsdbFetch<LiveResponse>("livescore", { l: lId });
      const liveEvents = ((liveData.events || liveData.match || []) as Event[]);

      const date =
        view === "YDAY"  ? buckets.yesterday :
        view === "TODAY" ? buckets.today :
        view === "TMRW"  ? buckets.tomorrow :
        buckets.today;

      let dayEvents: Event[] = [];

      if (view === "YDAY" || view === "TODAY" || view === "TMRW") {
        const dayData = await tsdbFetch<EventsDayResponse>("eventsday", {
          d: date,
          l: leagueMeta.name,
        });
        dayEvents = (dayData.events || []) as Event[];
      }

      if (view === "PREDICT") {
        // Fetch today + tomorrow for the predictions panel
        const [todayData, tmrwData, ydayData] = await Promise.all([
          tsdbFetch<EventsDayResponse>("eventsday", { d: buckets.today,     l: leagueMeta.name }),
          tsdbFetch<EventsDayResponse>("eventsday", { d: buckets.tomorrow,  l: leagueMeta.name }),
          tsdbFetch<EventsDayResponse>("eventsday", { d: buckets.yesterday, l: leagueMeta.name }),
        ]);
        const combined = [
          ...(ydayData.events  || []),
          ...(todayData.events || []),
          ...(tmrwData.events  || []),
        ] as Event[];
        // Dedupe by idEvent
        const seen = new Set<string>();
        dayEvents = combined.filter((e) => {
          if (seen.has(e.idEvent)) return false;
          seen.add(e.idEvent);
          return true;
        });
      }

      if (view === "TABLE") {
        const params: Record<string, string> = { l: lId };
        if (leagueMeta.season) params.s = leagueMeta.season;
        const tData = await tsdbFetch<TableResponse>("lookuptable", params);
        setTable((tData.table || []) as TableRow[]);
        setEvents([]);
        setPlayers([]);
      } else if (view === "SQUAD") {
        const squadTeamId = activeFavId;
        if (squadTeamId) {
          const sData = await tsdbFetch<SquadResponse>("lookupsquad", { id: squadTeamId });
          setPlayers((sData.player || []) as Player[]);
        } else {
          setPlayers([]);
        }
        setEvents([]);
        setTable([]);
      } else if (view === "LIVE") {
        setEvents(liveEvents);
        setTable([]);
        setPlayers([]);
      } else {
        setEvents(dayEvents);
        setTable([]);
        setPlayers([]);
      }

      // Update live badge for active favourite
      if (activeFavId) {
        setLiveEventForFav(
          liveEvents.find((e) => e.idHomeTeam === activeFavId || e.idAwayTeam === activeFavId) || null
        );
      } else {
        setLiveEventForFav(null);
      }

      setLastRefreshed(new Date());
    } catch (e: any) {
      setError(e?.message || "Refresh failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    const intervalMs = view === "LIVE" ? 20_000 : 60_000;
    const id = setInterval(refreshAll, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, view, activeFavId]);

  // ── Picker handlers ─────────────────────────────────────────────────
  function openClubPicker()   { setPickerMode("club");   setPickerOpen(true); }
  function openNationPicker() { setPickerMode("nation"); setPickerOpen(true); }

  function onPickFavourite(t: Team) {
    if (pickerMode === "nation") {
      localStorage.setItem(LS_FAV_NATION, t.idTeam);
      setFavNationId(t.idTeam);
    } else {
      localStorage.setItem(LS_FAV_CLUB, t.idTeam);
      setFavClubId(t.idTeam);
    }
    setPickerOpen(false);
  }

  // ── View title ───────────────────────────────────────────────────────
  const viewTitle =
    view === "LIVE"    ? `${leagueMeta.name} • Live` :
    view === "YDAY"    ? `${leagueMeta.name} • Yesterday (${buckets.yesterday})` :
    view === "TODAY"   ? `${leagueMeta.name} • Today (${buckets.today})` :
    view === "TMRW"    ? `${leagueMeta.name} • Tomorrow (${buckets.tomorrow})` :
    view === "TABLE"   ? (isTournament ? `${leagueMeta.name} • Groups` : `${leagueMeta.name} • Table`) :
    view === "SQUAD"   ? `${leagueMeta.name} • Squad` :
    view === "PREDICT" ? `${leagueMeta.name} • Predictions` :
    leagueMeta.name;

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-3 sm:px-5 py-4 sm:py-6 space-y-3 sm:space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="dot text-2xl sm:text-3xl font-semibold">Esra Scores</h1>
            <div className="dot text-xs sm:text-sm mt-1" style={{ color: "var(--muted)" }}>
              EPL · Championship · World Cup 2026
            </div>
          </div>
          <button
            onClick={refreshAll}
            className="dot rounded-xl px-3 py-2 text-xs sm:text-sm panel-strong glow border border-[rgba(255,255,255,0.12)]"
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Favourite header */}
        <FavouriteHeader
          team={activeFav}
          nextEvent={activeNextEvt}
          liveEvent={liveEventForFav}
          onChangeFavourite={isTournament ? openNationPicker : openClubPicker}
          mode={isTournament ? "nation" : "club"}
        />

        {/* League + view tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <LeagueTabs league={league} onChange={(l) => { setLeague(l); setView("TODAY"); }} />
          <ViewTabs view={view} onChange={setView} leagueType={leagueMeta.type} />
        </div>

        {/* Error */}
        {error && (
          <div className="panel-strong glow rounded-2xl px-4 py-3 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {/* Main content */}
        {view === "TABLE" ? (
          isTournament
            ? <GroupTableView rows={table} />
            : <TableView rows={table} />
        ) : view === "SQUAD" ? (
          <SquadView players={players} team={activeFav} />
        ) : view === "PREDICT" ? (
          <PredictionsView events={events} loading={loading} />
        ) : (
          <MatchList title={viewTitle} events={events} />
        )}

        {/* Footer */}
        <footer className="pt-2 pb-4 text-center">
          <div className="dot text-xs" style={{ color: "var(--muted)" }}>made with love by Daddy</div>
          <div className="dot text-xs mt-1" style={{ color: "var(--muted)" }}>
            Last refreshed: {lastRefreshed ? lastRefreshed.toLocaleTimeString() : "—"}
          </div>
        </footer>
      </div>

      <TeamPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPickFavourite}
        mode={pickerMode}
      />
    </main>
  );
}
