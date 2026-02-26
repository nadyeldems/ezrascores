extends Area2D

func interact() -> void:
	if GameState.world_flags.trial_completed:
		var ui := get_tree().get_first_node_in_group("dialogue_ui")
		if ui:
			ui.show_lines(["Lumi: You've already proven your tidecraft."])
		return
	var ui2 := get_tree().get_first_node_in_group("dialogue_ui")
	if ui2:
		ui2.show_choice("Challenge Cultural Trial vs Lumi?", ["Begin Trial", "Not yet"], _on_choice)

func _on_choice(idx: int) -> void:
	if idx != 0:
		return
	GameState.player.position = get_tree().current_scene.get_node("Player").global_position
	BattleManager.active_enemy = {"creature": "lumi", "level": 18}
	BattleManager.start_wild_battle(BattleManager.active_enemy)
