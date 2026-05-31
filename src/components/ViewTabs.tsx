export type ViewKey = "LIVE" | "YDAY" | "TODAY" | "TMRW" | "TABLE" | "SQUAD" | "PREDICT";

type TabDef = { key: ViewKey; label: string };

function getTabs(leagueType: "league" | "tournament"): TabDef[] {
  return [
    { key: "LIVE",    label: "Live" },
    { key: "YDAY",    label: "Yday" },
    { key: "TODAY",   label: "Today" },
    { key: "TMRW",    label: "Tmrw" },
    { key: "TABLE",   label: leagueType === "tournament" ? "Groups" : "Table" },
    { key: "SQUAD",   label: "Squad" },
    { key: "PREDICT", label: "Predict" },
  ];
}

export function ViewTabs({
  view,
  onChange,
  leagueType,
}: {
  view: ViewKey;
  onChange: (v: ViewKey) => void;
  leagueType: "league" | "tournament";
}) {
  const tabs = getTabs(leagueType);

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const active = view === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={[
              "dot rounded-xl px-3 py-2 text-xs sm:text-sm panel glow",
              active ? "border border-[rgba(57,214,255,0.55)]" : "border border-[rgba(255,255,255,0.08)]",
            ].join(" ")}
            aria-pressed={active}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
