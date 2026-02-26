extends Node

var encounter_tables := {}
var disabled_scenes: Array = []
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	load_data()
	rng.seed = GameState.roaming.rng_seed
	_validate_encounters()

func load_data() -> void:
	var path := "res://data/encounters.json"
	if not FileAccess.file_exists(path):
		return
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
	encounter_tables = data.get("tables", {})
	disabled_scenes = data.get("disabled_scenes", [])

func can_encounter(scene_name: String) -> bool:
	if disabled_scenes.has(scene_name):
		return false
	return encounter_tables.has(scene_name)

func roll_encounter(scene_name: String) -> Dictionary:
	if not can_encounter(scene_name):
		return {}
	var table: Array = encounter_tables[scene_name]
	var total := 0
	for entry in table:
		total += int(entry.get("weight", 0))
	if total <= 0:
		return {}
	var ticket := rng.randi_range(1, total)
	var acc := 0
	for entry in table:
		acc += int(entry["weight"])
		if ticket <= acc:
			var level := rng.randi_range(int(entry["min_level"]), int(entry["max_level"]))
			GameState.roaming.rng_seed = rng.seed
			return {"creature": entry["creature"], "level": level}
	return {}

func _validate_encounters() -> void:
	for scene_name in encounter_tables.keys():
		var total := 0
		for entry in encounter_tables[scene_name]:
			assert(entry.has("creature"), "Encounter creature missing in %s" % scene_name)
			assert(entry.has("weight"), "Encounter weight missing in %s" % scene_name)
			total += int(entry["weight"])
		assert(total > 0, "Encounter weight total must be >0 for %s" % scene_name)
