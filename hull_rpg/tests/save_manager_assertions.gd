extends SceneTree

func _init() -> void:
	var save_manager = load("res://scripts/managers/SaveManager.gd").new()
	var sample := {
		"save_version": 1,
		"player": {"scene":"StartTown_West","position":{"x":0,"y":0},"tile":{"x":0,"y":0},"facing":"down","last_safe_spawn":{"scene":"StartTown_West","position":Vector2.ZERO}},
		"party": [],
		"inventory": {},
		"world_flags": {},
		"npc_states": {},
		"roaming": {},
		"time_steps": {}
	}
	assert(save_manager._validate_schema(sample), "Schema should pass for complete sample")
	var legacy := sample.duplicate(true)
	legacy.erase("save_version")
	legacy.erase("time_steps")
	legacy.erase("roaming")
	legacy = save_manager._migrate_save(legacy)
	assert(legacy.save_version == 1, "Legacy migration should set save_version=1")
	assert(legacy.has("time_steps"), "Legacy migration should create time_steps")
	assert(legacy.has("roaming"), "Legacy migration should create roaming")
	print("SaveManager schema and migration assertions passed.")
	quit()
