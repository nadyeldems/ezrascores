import fs from "node:fs";

const creatures = new Set(JSON.parse(fs.readFileSync("./data/creatures.json", "utf8")).creatures.map((c) => c.id));
const tables = JSON.parse(fs.readFileSync("./data/encounters.json", "utf8")).tables;

for (const [scene, entries] of Object.entries(tables)) {
  let total = 0;
  for (const e of entries) {
    if (!creatures.has(e.creature)) throw new Error(`Unknown creature ${e.creature} in ${scene}`);
    if (e.min_level > e.max_level) throw new Error(`Invalid level range in ${scene}`);
    total += e.weight;
  }
  if (total <= 0) throw new Error(`Non-positive encounter weights in ${scene}`);
}

console.log("validate_encounters: ok");
