const SAVE_VERSION = 1;

function migrate(payload) {
  const out = { ...payload };
  if (typeof out.save_version !== "number") out.save_version = 0;
  if (out.save_version === 0) {
    if (!out.time_steps) out.time_steps = { total_steps: 0, clock_hours: 8, clock_minutes: 0 };
    if (!out.roaming) out.roaming = { rng_seed: 777, step_counter: 0, rare_counter: 0 };
    out.save_version = 1;
  }
  return out;
}

function validate(payload) {
  const req = ["save_version", "player", "party", "inventory", "world_flags", "npc_states", "roaming", "time_steps"];
  return req.every((k) => Object.prototype.hasOwnProperty.call(payload, k));
}

const sample = {
  save_version: SAVE_VERSION,
  player: { position: { x: 0, y: 0 }, tile: { x: 0, y: 0 }, facing: "down", current_scene: "StartTown_West", last_safe_spawn: { scene: "StartTown_West", position: { x: 0, y: 0 } } },
  party: [], inventory: {}, world_flags: {}, npc_states: {}, roaming: {}, time_steps: {}
};

if (!validate(sample)) throw new Error("Sample schema failed");

const legacy = { ...sample };
delete legacy.save_version;
delete legacy.time_steps;
delete legacy.roaming;
const migrated = migrate(legacy);
if (migrated.save_version !== 1) throw new Error("Migration failed to set save_version");
if (!migrated.time_steps || !migrated.roaming) throw new Error("Migration failed for missing keys");

console.log("validate_save_schema: ok");
