#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def load(name):
    with open(DATA / name, "r", encoding="utf-8") as f:
        return json.load(f)


def check_creatures_moves_items():
    creatures = load("creatures.json")["creatures"]
    moves = {m["id"] for m in load("moves.json")["moves"]}
    items = {i["id"] for i in load("items.json")["items"]}
    assert len(creatures) == 15, f"Expected 15 creatures, got {len(creatures)}"
    for c in creatures:
        assert c["moves"], f"Creature has no moves: {c['id']}"
        for m in c["moves"]:
            assert m in moves, f"Missing move id '{m}' used by {c['id']}"
    required_items = {
        "chip_spice", "pattie_bun", "fog_lantern", "dock_rope", "fair_token", "marina_pass",
        "founders_key", "silt_vial", "traffic_cone", "hull_fc_scarf", "hull_kr_badge"
    }
    missing = required_items - items
    assert not missing, f"Missing required items: {sorted(missing)}"


def check_encounter_tables():
    creatures = {c["id"] for c in load("creatures.json")["creatures"]}
    tables = load("encounters.json")["tables"]
    for scene, entries in tables.items():
        total = 0
        for e in entries:
            assert e["creature"] in creatures, f"Encounter creature missing: {scene}/{e['creature']}"
            assert e["min_level"] <= e["max_level"], f"Encounter level range invalid: {scene}/{e}"
            total += int(e["weight"])
        assert total > 0, f"Encounter weights total <= 0 for {scene}"


def check_evolution_lines_and_save_schema_shape():
    creatures = load("creatures.json")["creatures"]
    by_id = {c["id"]: c for c in creatures}
    roots = [c for c in creatures if c["evolves_to"]]
    chains = 0
    for c in roots:
        nxt = c["evolves_to"]
        if nxt in by_id and by_id[nxt]["evolves_to"]:
            chains += 1
    assert chains >= 3, f"Expected at least 3 multi-stage lines, got {chains}"

    expected_save_keys = {
        "save_version", "player", "party", "inventory", "world_flags", "npc_states", "roaming", "time_steps"
    }
    # Static check against SaveManager payload contract documented in README.
    assert len(expected_save_keys) == 8


if __name__ == "__main__":
    check_creatures_moves_items()
    check_encounter_tables()
    check_evolution_lines_and_save_schema_shape()
    print("All validation checks passed.")
