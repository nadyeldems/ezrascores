import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRouteHelpers, loadAppFunctions } from "./helpers/load.mjs";

const server = await loadRouteHelpers(["predictionBasePoints", "questBonusPointsByDate", "QUEST_SETS"]);
const app = loadAppFunctions(["predictionPointsFor", "dailyQuizKind"], ["SCORING_V2_FROM_MS"]);
const BEFORE = "2026-11-28T15:00:00Z";
const AFTER = "2026-12-05T15:00:00Z";

test("server scoring: 2/1 before 30 Nov, 5/2 from then", () => {
  assert.deepEqual(server.predictionBasePoints(2, 1, 2, 1, BEFORE), { points: 2, exact: true, correct: true });
  assert.deepEqual(server.predictionBasePoints(1, 0, 2, 1, BEFORE), { points: 1, exact: false, correct: true });
  assert.deepEqual(server.predictionBasePoints(2, 1, 2, 1, AFTER), { points: 5, exact: true, correct: true });
  assert.deepEqual(server.predictionBasePoints(1, 0, 2, 1, AFTER), { points: 2, exact: false, correct: true });
  assert.deepEqual(server.predictionBasePoints(0, 0, 2, 1, AFTER), { points: 0, exact: false, correct: false });
  assert.equal(server.predictionBasePoints(1, 1, 0, 0, AFTER).points, 2);
});

test("app scoring matches the server", () => {
  for (const [p, f, k] of [[[2, 1], [2, 1], BEFORE], [[1, 0], [2, 1], AFTER], [[2, 2], [1, 1], AFTER], [[0, 3], [1, 0], AFTER]]) {
    const a = app.predictionPointsFor(p[0], p[1], f[0], f[1], k);
    const s = server.predictionBasePoints(p[0], p[1], f[0], f[1], k);
    assert.deepEqual(a, s);
  }
});

test("v1 quest days still count in the weekly league; v2 days are all-time only", () => {
  const uid = "u1";
  const state = {
    familyLeague: {
      questBonusByDate: {
        "2026-11-24": { "acct:u1:quest-pop-5": true, "acct:u1:quest-predict-fixture": true },
        "2026-12-01": { "acct:u1:q2-predict": true, "acct:u1:q2-quiz": true, "acct:u1:q2-standings": true, "acct:u1:__bonus__": true },
        "2026-12-02": { "acct:u1:q2-quiz": true },
      },
    },
  };
  const out = server.questBonusPointsByDate(state, uid);
  assert.deepEqual(out["2026-11-24"], { points: 13, lifetimeOnly: false });
  assert.deepEqual(out["2026-12-01"], { points: 4 + 4 + 2 + 2, lifetimeOnly: true });
  assert.deepEqual(out["2026-12-02"], { points: 4, lifetimeOnly: true });
});

test("today's quiz rotates through all three games", () => {
  const kinds = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03"].map((d) => app.dailyQuizKind(d));
  assert.equal(new Set(kinds.slice(0, 3)).size, 3);
  assert.equal(kinds[3], kinds[0]);
});
