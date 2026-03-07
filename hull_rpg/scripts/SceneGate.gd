extends Area2D

@export var target_scene := "StartTown_West"
@export var spawn_position := Vector2(160, 160)

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node) -> void:
	if body is CharacterBody2D and body.name == "Player":
		GameState.player.last_safe_spawn = {"scene": target_scene, "position": spawn_position}
		SaveManager.save_game(0, true)
		SceneTransitionManager.go_to(target_scene, spawn_position)
