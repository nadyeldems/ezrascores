import { LEAGUES, LeagueKey } from "@/lib/tsdb";

export function LeagueTabs({ league, onChange }: { league: LeagueKey; onChange: (l: LeagueKey) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {(Object.entries(LEAGUES) as [LeagueKey, typeof LEAGUES[LeagueKey]][]).map(([key, meta]) => {
        const active = league === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={[
              "dot rounded-xl px-3 py-2 text-xs sm:text-sm panel glow",
              active ? "border border-[rgba(255,122,24,0.55)]" : "border border-[rgba(255,255,255,0.08)]",
            ].join(" ")}
            aria-pressed={active}
            title={meta.name}
          >
            {meta.shortName}
          </button>
        );
      })}
    </div>
  );
}
