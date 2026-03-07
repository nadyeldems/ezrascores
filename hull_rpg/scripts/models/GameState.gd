extends Node
class_name GameState

const SAVE_VERSION := 1

var player := {
	"scene": "StartTown_West",
	"position": Vector2(160, 160),
	"tile": Vector2i(5, 5),
	"facing": "down",
	"last_safe_spawn": {"scene": "StartTown_West", "position": Vector2(160, 160)}
}

var party: Array = []
var inventory := {}
var world_flags := {
	"trial_completed": false,
	"gates_opened": {},
	"key_items": {}
}
var npc_states := {
	"defeated_trainers": {},
	"one_time_dialogues": {},
	"ronnie_last_seen": -100000
}
var roaming := {
	"rng_seed": 777,
	"step_counter": 0,
	"last_scene_roll": ""
}
var time_steps := {
	"total_steps": 0,
	"clock_hours": 8,
	"clock_minutes": 0
}

func _ready() -> void:
	if party.is_empty():
		party.append(_make_creature_instance("spratlet", 5, ["splash_jab", "mist_pulse"]))
	inventory = {
		"chip_spice": 3,
		"pattie_bun": 1,
		"traffic_cone": 2,
		"fair_token": 2
	}

func _make_creature_instance(creature_id: String, level: int, moves: Array) -> Dictionary:
	var hp := 20 + level * 4
	return {
		"creature_id": creature_id,
		"nickname": creature_id.capitalize(),
		"level": level,
		"hp": hp,
		"max_hp": hp,
		"status": "",
		"xp": 0,
		"moves": moves,
		"evolution_state": "base"
	}

func advance_steps(step_delta: int) -> void:
	time_steps.total_steps += step_delta
	roaming.step_counter += step_delta
	var minutes_add := step_delta * 2
	time_steps.clock_minutes += minutes_add
	while time_steps.clock_minutes >= 60:
		time_steps.clock_minutes -= 60
		time_steps.clock_hours = (time_steps.clock_hours + 1) % 24

func game_hours_total() -> int:
	return time_steps.clock_hours + int(time_steps.total_steps / 30)
