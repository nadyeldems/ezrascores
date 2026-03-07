# Hullbound RPG v0.1 Plan

## Milestones
1. Project bootstrap
- Configure Godot 4 project settings.
- Add global autoload managers.
- Set up folder structure and naming conventions.

2. Data-first gameplay layer
- Create JSON sources under `/data` for creatures, moves, items, encounters, trainers, dialogues.
- Add lightweight model/parsing scripts.
- Add automated validations for data completeness and shape integrity.

3. Core exploration loop
- Build top-down player controller with 4-direction movement and 32x32 animation support.
- Add TileMap-based overworld scenes for all required locations.
- Implement interact button + dialogue UI.

4. Princes Quay landmark implementation
- Build `PrincesQuay_Exterior`, `PrincesQuay_TopDeck`, `PrincesQuay_Interior`.
- Add signage/NPC interactions for top deck, food, cinema, water below, meeting point.
- Document layout decisions in `docs/PRINCES_QUAY_NOTES.md`.

5. Encounters and battles
- Random route encounters (disabled indoors by default).
- Turn-based battle flow (`Fight`, `Item`, `Run`) with simple type chart.
- Cultural Trial boss battle vs Lumi.

6. Save/load robustness
- Implement 3 manual slots + 1 autosave slot.
- Persist player/party/inventory/world flags/NPC states/roaming seed+timers/clock+steps.
- Add fallback to StartTown_West if scene load fails.
- Add schema versioning and backward-compatible migration helpers.

7. Original asset pass and polish
- Generate in-repo original 32x32 sprite and tile PNG assets.
- Add animated water tiles.
- Add generated placeholder ambience/UI sounds.

8. Documentation and handoff
- Complete `README.md`, `docs/DESIGN.md`, `docs/WORLD.md`, `docs/TYPE_CHART.md`, `docs/PRINCES_QUAY_NOTES.md`.
- Provide extension notes for East/North Hull expansion.

## Run/Check gates
- Gate A: scene boot to `StartTown_West` works.
- Gate B: interaction + encounter trigger works.
- Gate C: battle end transitions and trial completion flag works.
- Gate D: save/load slot roundtrip + schema checks pass.
- Gate E: data validation + encounter validation checks pass.
