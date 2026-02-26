extends Area2D

@export var dialogue_id := ""
@export var one_time_flag := ""

func interact() -> void:
	if one_time_flag != "" and GameState.npc_states.one_time_dialogues.get(one_time_flag, false):
		return
	if dialogue_id != "":
		var ui = _dialogue_ui()
		if ui:
			ui.show_lines(DialogueManager.get_lines(dialogue_id))
	if one_time_flag != "":
		GameState.npc_states.one_time_dialogues[one_time_flag] = true

func _dialogue_ui() -> Node:
	return get_tree().get_first_node_in_group("dialogue_ui")
