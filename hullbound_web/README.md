# Hullbound: Tidal Creatures (Web v0.1)

Original-IP, cross-device, 2D top-down sprite RPG inspired by Hull, UK culture and landmarks. Built with plain HTML5 Canvas + JavaScript (no Godot runtime required).

## Play Locally
1. From `hullbound_web/` run:
   - `npm run dev`
2. Open `http://localhost:8787`

## Controls
- Desktop: `WASD` move, `E` interact, `Enter` advance dialogue, `Esc` menu.
- Save slots: `1`/`2`/`3`.
- Autosave: `F5`.
- Load slot 1 quick key: `F9`.
- Mobile: on-screen touch controls.

## Included v0.1 Scenes
- StartTown_West
- Route01_MarinaEdge
- Route02_FoundersLane
- TrialHall_West
- PrincesQuay_Exterior
- PrincesQuay_TopDeck
- PrincesQuay_Interior

## Features
- 4-direction movement and animated 32x32 player sprite.
- Interactable signs/NPCs + dialogue UI.
- Random route encounters.
- Turn battle (`Fight`, `Item`, `Run`) with type multipliers.
- Cultural Trial boss battle vs Lumi.
- Ronnie Pickering rare roaming NPC with exact interaction line and 24-hour in-game cooldown.
- Save/Load: 3 manual slots + 1 autosave with versioned schema + migration + scene fallback.

## Data-driven Content
- `data/creatures.json` (15 creatures, 3 evolution lines)
- `data/moves.json`
- `data/items.json` (20 cultural items)
- `data/encounters.json`
- `data/trainers.json`
- `data/dialogues.json`

## Validation checks
- `npm test`
  - `tests/validate_data.mjs`
  - `tests/validate_encounters.mjs`
  - `tests/validate_save_schema.mjs`

## Cloudflare Pages Deploy
1. Authenticate:
   - `npx wrangler whoami`
2. Deploy static site from `hullbound_web/`:
   - `npm run deploy:pages`

This project includes `wrangler.toml` configured for Pages static output.
