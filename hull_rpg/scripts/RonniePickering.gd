extends Area2D

@onready var prompt_ui := get_tree().get_first_node_in_group("dialogue_ui")

func _ready() -> void:
	var can_spawn := _can_spawn()
	visible = can_spawn
	monitoring = can_spawn

func interact() -> void:
	if not visible:
		return
	if prompt_ui and prompt_ui.has_method("show_choice"):
		prompt_ui.show_choice("Ronnie Pickering?", ["Ronnie Pickering?", "Never mind"], _on_choice)

func _on_choice(choice_idx: int) -> void:
	if choice_idx == 0:
		if prompt_ui:
			prompt_ui.show_lines(["Yeah. Me."])
		GameState.npc_states.ronnie_last_seen = GameState.game_hours_total()
		visible = false
		monitoring = false

func _can_spawn() -> bool:
	var cooldown := 24
	return GameState.game_hours_total() - int(GameState.npc_states.ronnie_last_seen) >= cooldown and randi() % 3 == 0
