import { LEAGUES, LeagueKey } from "@/lib/tsdb";

export function LeagueTabs({ league, onChange }: { league: LeagueKey; onChange: (l: LeagueKey) => void }) {
  return (
    <div className="flex gap-2">
      {Object.entries(LEAGUES).map(([key, val]) => {
        const k = key as LeagueKey;
        const active = league === k;
        return (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={[
              "dot rounded-xl px-3 py-2 text-xs sm:text-sm panel glow",
              active ? "border border-[rgba(255,122,24,0.55)]" : "border border-[rgba(255,255,255,0.08)]",
            ].join(" ")}
            aria-pressed={active}
            title={val.name}
          >
            {k === "EPL" ? "EPL" : "CHAMP"}
          </button>
        );
      })}
    </div>
  );
}
