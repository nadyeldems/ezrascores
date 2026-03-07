import fs from "node:fs";

const creatures = JSON.parse(fs.readFileSync("./data/creatures.json", "utf8")).creatures;
const moves = JSON.parse(fs.readFileSync("./data/moves.json", "utf8")).moves;
const items = JSON.parse(fs.readFileSync("./data/items.json", "utf8")).items;

if (creatures.length !== 15) throw new Error(`Expected 15 creatures, got ${creatures.length}`);

const moveIds = new Set(moves.map((m) => m.id));
for (const c of creatures) {
  if (!c.moves?.length) throw new Error(`Creature missing moves: ${c.id}`);
  for (const m of c.moves) if (!moveIds.has(m)) throw new Error(`Unknown move ${m} on ${c.id}`);
}

const reqItems = ["chip_spice", "pattie_bun", "fog_lantern", "dock_rope", "fair_token", "marina_pass", "founders_key", "silt_vial", "traffic_cone", "hull_fc_scarf", "hull_kr_badge"];
const itemIds = new Set(items.map((i) => i.id));
for (const id of reqItems) if (!itemIds.has(id)) throw new Error(`Missing required item: ${id}`);

console.log("validate_data: ok");
