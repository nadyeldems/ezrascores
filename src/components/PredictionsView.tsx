"use client";

import {
  Event,
  Prediction,
  getPrediction,
  savePrediction,
  predictionPoints,
  isMatchPlayed,
  localTime,
} from "@/lib/tsdb";
import { useState, useEffect } from "react";

function PredictCard({ event }: { event: Event }) {
  const played = isMatchPlayed(event);
  const [stored, setStored] = useState<Prediction | null>(null);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = getPrediction(event.idEvent);
    setStored(p);
    if (p) {
      setHome(p.home.toString());
      setAway(p.away.toString());
      setSaved(true);
    }
  }, [event.idEvent]);

  function handleSave() {
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
    const pred = { home: h, away: a };
    savePrediction(event.idEvent, pred);
    setStored(pred);
    setSaved(true);
  }

  const points = stored ? predictionPoints(stored, event) : null;

  const pointsStyle =
    points === 3
      ? { color: "var(--accent)", border: "1px solid rgba(255,122,24,0.5)", background: "rgba(255,122,24,0.08)" }
      : points === 1
      ? { color: "var(--cyan)", border: "1px solid rgba(57,214,255,0.5)", background: "rgba(57,214,255,0.08)" }
      : { color: "var(--muted)", border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <div className="panel-strong glow rounded-2xl px-3 py-3 sm:px-4">
      <div className="dot text-xs mb-1" style={{ color: "var(--muted)" }}>
        {event.dateEvent || "TBC"}
        {localTime(event) ? ` • ${localTime(event)}` : ""}
        {event.strRound ? ` • ${event.strRound}` : ""}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm font-semibold leading-snug">
          <span>{event.strHomeTeam || "TBC"}</span>
          <span className="mx-2 font-normal" style={{ color: "var(--muted)" }}>vs</span>
          <span>{event.strAwayTeam || "TBC"}</span>
        </div>

        {played ? (
          <div className="flex items-center gap-2 shrink-0">
            <div className="dot text-sm font-semibold" style={{ color: "var(--accent)" }}>
              {event.intHomeScore} – {event.intAwayScore}
            </div>
            {stored && (
              <div className="dot text-xs" style={{ color: "var(--muted)" }}>
                pred: {stored.home}–{stored.away}
              </div>
            )}
            {points !== null && (
              <div className="dot text-xs px-2 py-1 rounded-xl" style={pointsStyle}>
                {points === 3 ? "+3" : points === 1 ? "+1" : "0"} pts
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              min={0}
              max={20}
              value={home}
              onChange={(e) => { setHome(e.target.value); setSaved(false); }}
              placeholder="0"
              className="w-10 rounded-xl text-center py-1 bg-black/25 border border-[rgba(255,255,255,0.10)] outline-none text-sm"
            />
            <span className="dot text-xs" style={{ color: "var(--muted)" }}>–</span>
            <input
              type="number"
              min={0}
              max={20}
              value={away}
              onChange={(e) => { setAway(e.target.value); setSaved(false); }}
              placeholder="0"
              className="w-10 rounded-xl text-center py-1 bg-black/25 border border-[rgba(255,255,255,0.10)] outline-none text-sm"
            />
            <button
              onClick={handleSave}
              disabled={home === "" || away === ""}
              className="dot rounded-xl px-2 py-1 text-xs panel glow border disabled:opacity-50 ml-1"
              style={
                saved
                  ? { color: "var(--cyan)", borderColor: "rgba(57,214,255,0.5)" }
                  : { borderColor: "rgba(255,255,255,0.12)" }
              }
            >
              {saved ? "✓" : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function PredictionsView({ events, loading }: { events: Event[]; loading: boolean }) {
  const [totalPoints, setTotalPoints] = useState(0);
  const [predictedCount, setPredictedCount] = useState(0);

  useEffect(() => {
    let pts = 0;
    let count = 0;
    for (const e of events) {
      const pred = getPrediction(e.idEvent);
      if (pred) {
        count++;
        const p = predictionPoints(pred, e);
        if (p != null) pts += p;
      }
    }
    setTotalPoints(pts);
    setPredictedCount(count);
  }, [events]);

  return (
    <div className="panel glow rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="dot text-sm sm:text-base" style={{ color: "var(--muted)" }}>Predictions</h2>
        <div className="flex items-center gap-3">
          {predictedCount > 0 && (
            <div className="dot text-xs font-semibold" style={{ color: "var(--accent)" }}>
              {totalPoints} pts
            </div>
          )}
          <div className="dot text-xs" style={{ color: "var(--muted)" }}>
            {predictedCount}/{events.length} predicted
          </div>
        </div>
      </div>

      <div className="dot text-xs mb-3" style={{ color: "var(--muted)" }}>
        Exact score = 3 pts · Correct result = 1 pt
      </div>

      <div className="space-y-2">
        {events.map((e) => (
          <PredictCard key={e.idEvent} event={e} />
        ))}
        {events.length === 0 && !loading && (
          <div className="rounded-2xl panel-strong glow px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
            No fixtures to predict right now.
          </div>
        )}
      </div>
    </div>
  );
}
