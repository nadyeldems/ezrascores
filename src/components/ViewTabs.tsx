export type ViewKey = "LIVE" | "YDAY" | "TODAY" | "TMRW" | "TABLE";

const TABS: { key: ViewKey; label: string }[] = [
  { key: "LIVE", label: "Live" },
  { key: "YDAY", label: "Yday" },
  { key: "TODAY", label: "Today" },
  { key: "TMRW", label: "Tmrw" },
  { key: "TABLE", label: "Table" },
];

export function ViewTabs({ view, onChange }: { view: ViewKey; onChange: (v: ViewKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
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
