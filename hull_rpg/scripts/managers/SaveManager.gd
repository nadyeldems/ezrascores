extends Node

const SAVE_DIR := "user://saves"
const AUTOSAVE_SLOT := 0
const MAX_MANUAL_SLOT := 3

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)

func save_game(slot: int, autosave := false) -> bool:
	if not autosave and (slot < 1 or slot > MAX_MANUAL_SLOT):
		push_error("Manual slot must be 1..3")
		return false
	if autosave:
		slot = AUTOSAVE_SLOT
	var payload := _build_payload()
	assert(payload.has("save_version"), "save_version required")
	var path := "%s/slot_%d.save" % [SAVE_DIR, slot]
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify(payload, "\t"))
	return true

func load_game(slot: int, autosave := false) -> bool:
	if autosave:
		slot = AUTOSAVE_SLOT
	var path := "%s/slot_%d.save" % [SAVE_DIR, slot]
	if not FileAccess.file_exists(path):
		return false
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	var payload: Dictionary = _migrate_save(parsed)
	if not _validate_schema(payload):
		return false
	_apply_payload(payload)
	var scene_path := "res://scenes/%s.tscn" % GameState.player.scene
	if not ResourceLoader.exists(scene_path):
		GameState.player.scene = "StartTown_West"
		GameState.player.position = Vector2(160, 160)
	get_tree().change_scene_to_file("res://scenes/%s.tscn" % GameState.player.scene)
	return true

func _build_payload() -> Dictionary:
	return {
		"save_version": GameState.SAVE_VERSION,
		"player": {
			"scene": GameState.player.scene,
			"position": {"x": GameState.player.position.x, "y": GameState.player.position.y},
			"tile": {"x": GameState.player.tile.x, "y": GameState.player.tile.y},
			"facing": GameState.player.facing,
			"last_safe_spawn": GameState.player.last_safe_spawn
		},
		"party": GameState.party,
		"inventory": GameState.inventory,
		"world_flags": GameState.world_flags,
		"npc_states": GameState.npc_states,
		"roaming": GameState.roaming,
		"time_steps": GameState.time_steps
	}

func _apply_payload(payload: Dictionary) -> void:
	GameState.player = payload["player"]
	var p: Dictionary = payload["player"]
	var pos: Dictionary = p["position"]
	var tile: Dictionary = p["tile"]
	var px := float(pos["x"])
	var py := float(pos["y"])
	GameState.player.position = Vector2(px, py)
	GameState.player.tile = Vector2i(int(tile["x"]), int(tile["y"]))
	GameState.party = payload["party"]
	GameState.inventory = payload["inventory"]
	GameState.world_flags = payload["world_flags"]
	GameState.npc_states = payload["npc_states"]
	GameState.roaming = payload["roaming"]
	GameState.time_steps = payload["time_steps"]

func _validate_schema(payload: Dictionary) -> bool:
	var required := ["save_version", "player", "party", "inventory", "world_flags", "npc_states", "roaming", "time_steps"]
	for key in required:
		assert(payload.has(key), "Save missing key: %s" % key)
	if payload["player"] is Dictionary:
		for pkey in ["scene", "position", "tile", "facing", "last_safe_spawn"]:
			assert(payload["player"].has(pkey), "Player missing key: %s" % pkey)
	else:
		return false
	return true

func _migrate_save(payload: Dictionary) -> Dictionary:
	if not payload.has("save_version"):
		payload["save_version"] = 0
	if int(payload["save_version"]) == 0:
		if not payload.has("time_steps"):
			payload["time_steps"] = {"total_steps": 0, "clock_hours": 8, "clock_minutes": 0}
		if not payload.has("roaming"):
			payload["roaming"] = {"rng_seed": 777, "step_counter": 0, "last_scene_roll": ""}
		payload["save_version"] = 1
	return payload
