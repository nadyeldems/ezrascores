import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRouteHelpers } from "./helpers/load.mjs";

const m = await loadRouteHelpers(["isStaleLiveEvent", "mergeEventsByKey", "mergeEvents", "isLiveEvent", "pushAlertsForEvent"]);
const NOW = Date.parse("2026-11-23T13:30:00Z");
const stuck = { idEvent: "2506296", dateEvent: "2026-11-22", strTime: "17:30:00", strStatus: "1H", strProgress: "30", intHomeScore: 1, intAwayScore: 0 };
const ft = { ...stuck, strStatus: "FT", strProgress: "" };

test("a live status hours after kickoff is stale", () => {
  assert.equal(m.isStaleLiveEvent(stuck, NOW), true);
  assert.equal(m.isStaleLiveEvent({ ...stuck, dateEvent: "2026-11-23", strTime: "12:30:00" }, NOW), false);
  assert.equal(m.isStaleLiveEvent(ft, NOW), false);
});

test("a late live snapshot never overwrites full time", () => {
  assert.equal(m.mergeEventsByKey([ft, stuck])[0].strStatus, "FT");
  assert.equal(m.mergeEventsByKey([stuck, ft])[0].strStatus, "FT");
  assert.equal(m.mergeEvents([ft], [stuck])[0].strStatus, "FT");
  const live = { ...stuck, dateEvent: "2026-11-23" };
  assert.equal(m.mergeEventsByKey([live, { ...live, strStatus: "HT" }])[0].strStatus, "HT");
});

test("push alerts: kickoff, goals, full time, nothing on first sighting", () => {
  const ev = (o) => ({ idEvent: "1", idHomeTeam: "10", idAwayTeam: "20", strHomeTeam: "Hull City", strAwayTeam: "Brighton", ...o });
  const kinds = (event, prev) => m.pushAlertsForEvent(event, prev).alerts.map((a) => a.kind);
  assert.deepEqual(kinds(ev({ strStatus: "1H", intHomeScore: 1, intAwayScore: 0 }), null), []);
  assert.deepEqual(kinds(ev({ strStatus: "1H", intHomeScore: 0, intAwayScore: 0 }), { phase: "pre", home: 0, away: 0 }), ["kickoff"]);
  const goal = m.pushAlertsForEvent(ev({ strStatus: "1H", strProgress: "34", intHomeScore: 1, intAwayScore: 0 }), { phase: "live", home: 0, away: 0 });
  assert.equal(goal.alerts[0].body, "Hull City 1-0 Brighton (34')");
  assert.deepEqual(kinds(ev({ strStatus: "2H", intHomeScore: 2, intAwayScore: 1 }), { phase: "live", home: 1, away: 0 }), ["goal", "goal"]);
  assert.deepEqual(kinds(ev({ strStatus: "2H", intHomeScore: 0, intAwayScore: 0 }), { phase: "live", home: 1, away: 0 }), []);
  assert.deepEqual(kinds(ev({ strStatus: "FT", intHomeScore: 2, intAwayScore: 0 }), { phase: "live", home: 2, away: 0 }), ["fulltime"]);
  assert.deepEqual(kinds(ev({ strStatus: "FT", intHomeScore: 2, intAwayScore: 0 }), { phase: "ft", home: 2, away: 0 }), []);
});
