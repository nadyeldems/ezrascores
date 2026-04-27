import { NextResponse } from "next/server";

const API_KEY = process.env.TSDB_API_KEY;

const V1_BASE = "https://www.thesportsdb.com/api/v1/json";
const V2_BASE = "https://www.thesportsdb.com/api/v2/json";

type Endpoint = "eventsday" | "lookuptable" | "livescore" | "searchteams" | "lookupteam" | "eventsnext";

function bad(msg: string, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

export async function GET(req: Request) {
  if (!API_KEY) return bad("Missing TSDB_API_KEY (set it in .env.local).", 500);

  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint") as Endpoint | null;
  if (!endpoint) return bad("Missing endpoint.");

  const allowed: Endpoint[] = ["eventsday", "lookuptable", "livescore", "searchteams", "lookupteam", "eventsnext"];
  if (!allowed.includes(endpoint)) return bad("Endpoint not allowed.");

  let url: URL;

  try {
    switch (endpoint) {
      case "eventsday": {
        const d = searchParams.get("d");
        const l = searchParams.get("l");
        if (!d || !l) return bad("eventsday requires d and l.");
        url = new URL(`${V1_BASE}/${API_KEY}/eventsday.php`);
        url.searchParams.set("d", d);
        url.searchParams.set("l", l);
        break;
      }
      case "lookuptable": {
        const l = searchParams.get("l");
        const s = searchParams.get("s");
        if (!l) return bad("lookuptable requires l.");
        url = new URL(`${V1_BASE}/${API_KEY}/lookuptable.php`);
        url.searchParams.set("l", l);
        if (s) url.searchParams.set("s", s);
        break;
      }
      case "livescore": {
        const l = searchParams.get("l");
        if (!l) return bad("livescore requires l.");

        // Try v2 livescore first; if it fails, fall back to v1.
        const v2 = new URL(`${V2_BASE}/${API_KEY}/livescore/${l}`);
        const v2Res = await fetch(v2.toString(), { next: { revalidate: 15 } });
        if (v2Res.ok) {
          const data = await v2Res.json();
          return NextResponse.json(data, { status: 200 });
        }

        url = new URL(`${V1_BASE}/${API_KEY}/livescore.php`);
        url.searchParams.set("l", l);
        break;
      }
      case "searchteams": {
        const t = searchParams.get("t");
        if (!t) return bad("searchteams requires t.");
        url = new URL(`${V1_BASE}/${API_KEY}/searchteams.php`);
        url.searchParams.set("t", t);
        break;
      }
      case "lookupteam": {
        const id = searchParams.get("id");
        if (!id) return bad("lookupteam requires id.");
        url = new URL(`${V1_BASE}/${API_KEY}/lookupteam.php`);
        url.searchParams.set("id", id);
        break;
      }
      case "eventsnext": {
        const id = searchParams.get("id");
        if (!id) return bad("eventsnext requires id.");
        url = new URL(`${V1_BASE}/${API_KEY}/eventsnext.php`);
        url.searchParams.set("id", id);
        break;
      }
      default:
        return bad("Unhandled endpoint.");
    }

    const res = await fetch(url.toString(), { next: { revalidate: 30 } });
    const text = await res.text();

    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: res.status });
    } catch {
      return NextResponse.json({ raw: text }, { status: res.status });
    }
  } catch (e: any) {
    return bad(e?.message || "Server error", 500);
  }
}
