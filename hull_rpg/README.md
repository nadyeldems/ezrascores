# Hullbound: Tidal Creatures (Godot 4.x)

Original-IP, top-down, sprite-based RPG inspired by coastal city culture in Hull, UK. No Nintendo/Pokemon IP/assets used.

## v0.1 Included Regions
- StartTown_West (Tidal Quarter)
- Route01_MarinaEdge
- Route02_FoundersLane
- TrialHall_West
- PrincesQuay_Exterior
- PrincesQuay_TopDeck
- PrincesQuay_Interior

## Controls
- Move: `WASD`
- Interact / advance dialogue: `E`
- Confirm dialogue: `Enter`
- Manual Save: `1`, `2`, `3` (slots 1-3)
- Autosave now: `F5` (slot 0)
- Load slot 1 quick key: `F9`

## Save System
- `slot_0`: autosave
- `slot_1..slot_3`: manual saves
- Stored fields include player position/facing/scene/spawn, party, inventory, world flags, NPC states, roaming seed+steps, and game clock+steps.
- If saved scene is missing on load, fallback spawn is StartTown_West.

## Data-Driven Files
- `data/creatures.json`
- `data/moves.json`
- `data/items.json`
- `data/encounters.json`
- `data/trainers.json`
- `data/dialogues.json`

## Automated Checks
- Run data + encounter + evolution checks:
  - `python3 tests/validate_data.py`
- Save schema/version assertions script (Godot headless):
  - `godot4 --headless --path . --script res://tests/save_manager_assertions.gd`

## Run
1. Open `hull_rpg` in Godot 4.x.
2. Press Play (`StartTown_West.tscn` is default main scene).

## Notes
- All sprite/tile assets are generated in-repo under `assets/` as original 32x32 pixel art placeholders.
- Audio placeholders are generated WAV tones/ambience under `audio/`.
