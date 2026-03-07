# DESIGN (Web)

## Architecture
- `index.html` + `styles.css`: game shell, HUD, dialogue/battle/menu overlays, touch controls.
- `scripts/game.js`: runtime loop, map generation, input, interactions, encounters, battle logic, save/load.
- `data/*.json`: creatures/moves/items/encounters/trainers/dialogues.

## Save Schema
- `save_version`
- `player`: pixel/tile pos, facing, current scene, last safe spawn
- `party`: creature state + moves + xp/evolution state
- `inventory`
- `world_flags`
- `npc_states` (including Ronnie cooldown)
- `roaming` (seed + deterministic step counters)
- `time_steps` (total steps + in-game clock)

## Fallback Behavior
- Invalid/missing scene on load redirects to `StartTown_West` spawn.
