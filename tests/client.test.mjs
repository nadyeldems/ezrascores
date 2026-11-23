import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAppFunctions } from "./helpers/load.mjs";

const app = loadAppFunctions(["prettyStatLabel", "notificationTimeLabel", "sportsDbRendition"]);

test("stat labels read as plain English", () => {
  assert.equal(app.prettyStatLabel("expected_goals"), "Expected goals (xG)");
  assert.equal(app.prettyStatLabel("Shots insidebox"), "Shots inside box");
  assert.equal(app.prettyStatLabel("Ball Possession"), "Ball possession");
});

test("notification times include the day once they're not from today", () => {
  const now = new Date();
  assert.match(app.notificationTimeLabel({ timeIso: now.toISOString() }), /^\d{2}:\d{2}$/);
  assert.match(app.notificationTimeLabel({ timeIso: new Date(now - 86400000).toISOString() }), /^Yesterday \d{2}:\d{2}$/);
  assert.equal(app.notificationTimeLabel({ timeIso: "2026-03-22T18:26:00Z" }), "22 Mar");
});

test("TheSportsDB images use the small rendition", () => {
  const badge = "https://r2.thesportsdb.com/images/media/team/badge/abc.png";
  assert.equal(app.sportsDbRendition(badge, "tiny"), `${badge}/tiny`);
  assert.equal(app.sportsDbRendition(`${badge}/small`, "tiny"), `${badge}/small`);
  assert.equal(app.sportsDbRendition("https://example.com/x.png", "tiny"), "https://example.com/x.png");
  assert.equal(app.sportsDbRendition(badge, "full"), badge);
});
