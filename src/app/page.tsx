"use client";

import { FavouriteHeader } from "@/components/FavouriteHeader";
import { LeagueTabs } from "@/components/LeagueTabs";
import { MatchList } from "@/components/MatchList";
import { TableView } from "@/components/TableView";
import { TeamPicker } from "@/components/TeamPicker";
import { LEAGUES, LeagueKey, Team, Event, TableRow, getDateBuckets, tsdbFetch } from "@/lib/tsdb";
import { useEffect, useMemo, useState } from "react";
import { ViewKey, ViewTabs } from "@/components/ViewTabs";

type EventsDayResponse = { events: Event[] | null };
type LiveResponse = { events: Event[] | null; match: Event[] | null };
type TableResponse = { table: TableRow[] | null };
type LookupTeamResponse = { teams: Team[] | null };
type NextEventsResponse = { events: Event[] | null };

const LS_KEY = "esraScores:favouriteTeamId";

export default function Home() {
  const [league, setLeague] = useState<LeagueKey>("EPL");
  const [view, setView] = useState<ViewKey>("TODAY");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [favTeamId, setFavTeamId] = useState<string | null>(null);
  const [favTeam, setFavTeam] = useState<Team | null>(null);
  const [nextEvent, setNextEvent] = useState<Event | null>(null);
  const [liveEventForFav, setLiveEventForFav] = useState<Event | null>(null);

  const [events, setEvents] = useState<Event[]>([]);
  const [table, setTable] = useState<TableRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buckets = useMemo(() => getDateBuckets(), []);
  const leagueMeta = LEAGUES[league];

  useEffect(() => {
    const v = localStorage.getItem(LS_KEY);
    if (v) setFavTeamId(v);
  }, []);

  useEffect(() => {
    if (!favTeamId) {
      setFavTeam(null);
      setNextEvent(null);
      setLiveEventForFav(null);
      return;
    }

    (async () => {
      try {
        const tData = await tsdbFetch<LookupTeamResponse>("lookupteam", { id: favTeamId });
        setFavTeam(tData.teams?.[0] || null);

        const nData = await tsdbFetch<NextEventsResponse>("eventsnext", { id: favTeamId });
        setNextEvent(nData.events?.[0] || null);
      } catch {
        // ignore
      }
    })();
  }, [favTeamId]);

  async function refreshAll() {
    setLoading(true);
    setError(null);

    try {
      const lId = leagueMeta.id;

      const liveData = await tsdbFetch<LiveResponse>("livescore", { l: lId });
      const liveEvents = ((liveData.events || liveData.match || []) as Event[]) || [];

      const date =
        view === "YDAY" ? buckets.yesterday :
        view === "TODAY" ? buckets.today :
        view === "TMRW" ? buckets.tomorrow :
        buckets.today;

      let dayEvents: Event[] = [];
      if (view === "YDAY" || view === "TODAY" || view === "TMRW") {
        const dayData = await tsdbFetch<EventsDayResponse>("eventsday", { d: date, l: leagueMeta.name });
        dayEvents = (dayData.events || []) as Event[];
      }

      let tableRows: TableRow[] = [];
      if (view === "TABLE") {
        const tData = await tsdbFetch<TableResponse>("lookuptable", { l: lId });
        tableRows = (tData.table || []) as TableRow[];
      }

      if (view === "LIVE") {
        setEvents(liveEvents);
      } else if (view === "TABLE") {
        setEvents([]);
        setTable(tableRows);
      } else {
        setEvents(dayEvents);
      }

      if (favTeamId) {
        setLiveEventForFav(liveEvents.find((e) => e.idHomeTeam === favTeamId || e.idAwayTeam === favTeamId) || null);
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
    const intervalMs = view === "LIVE" ? 20000 : 60000;
    const id = setInterval(refreshAll, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, view, favTeamId]);

  function onPickFavourite(t: Team) {
    localStorage.setItem(LS_KEY, t.idTeam);
    setFavTeamId(t.idTeam);
    setPickerOpen(false);
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-4xl px-3 sm:px-5 py-4 sm:py-6 space-y-3 sm:space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="dot text-2xl sm:text-3xl font-semibold">Esra Scores</h1>
            <div className="dot text-xs sm:text-sm mt-1" style={{ color: "var(--muted)" }}>
              EPL + Championship • Live • Fixtures • Tables
            </div>
          </div>

          <button
            onClick={refreshAll}
            className="dot rounded-xl px-3 py-2 text-xs sm:text-sm panel-strong glow border border-[rgba(255,255,255,0.12)]"
            disabled={loading}
            title="Refresh"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <FavouriteHeader
          team={favTeam}
          nextEvent={nextEvent}
          liveEvent={liveEventForFav}
          onChangeFavourite={() => setPickerOpen(true)}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
          <LeagueTabs league={league} onChange={setLeague} />
          <ViewTabs view={view} onChange={setView} />
        </div>

        {error ? (
          <div className="panel-strong glow rounded-2xl px-4 py-3 text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        ) : null}

        {view === "TABLE" ? (
          <TableView rows={table} />
        ) : (
          <MatchList
            title={
              view === "LIVE" ? `${leagueMeta.name} • Live` :
              view === "YDAY" ? `${leagueMeta.name} • Yesterday (${buckets.yesterday})` :
              view === "TODAY" ? `${leagueMeta.name} • Today (${buckets.today})` :
              `${leagueMeta.name} • Tomorrow (${buckets.tomorrow})`
            }
            events={events}
          />
        )}

        <footer className="pt-2 pb-4 text-center">
          <div className="dot text-xs" style={{ color: "var(--muted)" }}>made with love by Daddy</div>
          <div className="dot text-xs mt-1" style={{ color: "var(--muted)" }}>
            Last refreshed: {lastRefreshed ? lastRefreshed.toLocaleTimeString() : "—"}
          </div>
        </footer>
      </div>

      <TeamPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPickFavourite} />
    </main>
  );
}
