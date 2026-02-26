extends Node

signal battle_started(encounter: Dictionary)
signal battle_ended(victory: bool)

var in_battle := false
var active_enemy := {}
var return_scene := "StartTown_West"
var return_position := Vector2(160, 160)
var type_chart := {
	"Water": {"Fire": 1.5, "Earth": 1.2, "Grass": 0.7},
	"Grass": {"Water": 1.5, "Earth": 1.3, "Air": 0.8},
	"Electric": {"Water": 1.5, "Air": 1.4, "Earth": 0.6},
	"Earth": {"Electric": 1.6, "Steel": 1.2, "Air": 0.6},
	"Steel": {"Light": 0.9, "Air": 1.1},
	"Psychic": {"Electric": 1.1, "Steel": 0.9},
	"Air": {"Grass": 1.3, "Steel": 0.8},
	"Light": {"Psychic": 1.3, "Steel": 0.9}
}

func start_wild_battle(encounter: Dictionary) -> void:
	in_battle = true
	return_scene = GameState.player.scene
	return_position = GameState.player.position
	active_enemy = encounter.duplicate(true)
	emit_signal("battle_started", active_enemy)
	SceneTransitionManager.go_to("BattleScene", Vector2(-1, -1))

func type_multiplier(move_type: String, defender_types: Array) -> float:
	var mult := 1.0
	for d_type in defender_types:
		if type_chart.has(move_type) and type_chart[move_type].has(d_type):
			mult *= float(type_chart[move_type][d_type])
	return mult

func end_battle(victory: bool) -> void:
	in_battle = false
	emit_signal("battle_ended", victory)
	SceneTransitionManager.go_to(return_scene, return_position)
