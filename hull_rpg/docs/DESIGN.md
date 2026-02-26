# DESIGN

## Core Loop
1. Explore West Hull-inspired overworld.
2. Interact with signs/NPCs for cultural cues and location flavor.
3. Trigger random route encounters.
4. Resolve turn-based battles (Fight / Item / Run).
5. Challenge Cultural Trial boss (Lumi).
6. Save and continue via slots/autosave.

## Architecture
- Managers (`scripts/managers`): Dialogue, Encounter, Battle, Save, Audio, Scene Transition.
- Global model (`scripts/models/GameState.gd`): runtime state mirrored to save payload.
- Data JSON: creatures/moves/items/encounters/trainers/dialogues.
- Maps: TileMap layers + scripted layout generation.

## Battle Rules v0.1
- One active party creature at a time.
- Move damage from move power and type multiplier.
- Items consume inventory.
- Run uses escape chance.

## Save Versioning
- `save_version` currently `1`.
- Migration path from legacy `0` adds missing `roaming` and `time_steps`.
