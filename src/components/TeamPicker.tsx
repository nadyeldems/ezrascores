"use client";

import { Team, tsdbFetch } from "@/lib/tsdb";
import { useEffect, useMemo, useState } from "react";

export function TeamPicker({
  open,
  onClose,
  onPick,
  mode = "club",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (t: Team) => void;
  mode?: "club" | "nation";
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canSearch = useMemo(() => q.trim().length >= 3, [q]);

  const title = mode === "nation" ? "Choose Favourite Nation" : "Choose Favourite Team";
  const placeholder = mode === "nation"
    ? "e.g. England, France, Brazil"
    : "e.g. Leeds, Arsenal, Sunderland";

  useEffect(() => {
    if (!open) return;
    setQ("");
    setTeams([]);
    setError(null);
  }, [open]);

  async function search() {
    const query = q.trim();
    if (query.length < 3) return;

    try {
      setLoading(true);
      setError(null);
      const data = await tsdbFetch<{ teams: Team[] | null }>("searchteams", { t: query });
      setTeams((data.teams || []).slice(0, 30));
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canSearch) search();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-xl panel glow rounded-t-3xl sm:rounded-3xl p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="dot text-xs" style={{ color: "var(--muted)" }}>{title}</div>
            <div className="mt-1 text-lg sm:text-xl font-semibold">Search by name</div>
          </div>
          <button
            onClick={onClose}
            className="dot rounded-xl px-3 py-2 text-xs panel-strong glow border border-[rgba(255,255,255,0.12)]"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder={placeholder}
            className="w-full rounded-2xl px-4 py-3 bg-black/25 border border-[rgba(255,255,255,0.10)] outline-none"
          />
          <button
            onClick={search}
            disabled={!canSearch || loading}
            className="dot rounded-2xl px-4 py-3 panel-strong glow border border-[rgba(255,255,255,0.12)] disabled:opacity-50"
          >
            {loading ? "..." : "Search"}
          </button>
        </div>

        <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          Type at least 3 characters, then hit Search or press Enter.
        </div>

        {error && (
          <div className="mt-3 rounded-2xl px-4 py-3 panel-strong glow text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div className="mt-4 space-y-2 max-h-[55vh] overflow-auto pr-1">
          {teams.map((t) => (
            <button key={t.idTeam} onClick={() => onPick(t)} className="w-full text-left rounded-2xl panel-strong glow px-4 py-3">
              <div className="flex items-center gap-3">
                {t.strTeamBadge ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.strTeamBadge} alt="" className="h-10 w-10 rounded-xl bg-black/25 p-1" />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-black/25" />
                )}
                <div className="min-w-0">
                  <div className="text-sm sm:text-base font-semibold leading-snug">{t.strTeam}</div>
                  <div className="dot text-xs" style={{ color: "var(--muted)" }}>ID: {t.idTeam}</div>
                </div>
              </div>
            </button>
          ))}

          {teams.length === 0 && (
            <div className="rounded-2xl panel-strong glow px-4 py-6 text-sm" style={{ color: "var(--muted)" }}>
              No results yet. Search above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
