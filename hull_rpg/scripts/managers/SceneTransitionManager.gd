extends Node

func go_to(scene_name: String, spawn_pos: Vector2 = Vector2(-1, -1)) -> void:
	var scene_path := "res://scenes/%s.tscn" % scene_name
	if not ResourceLoader.exists(scene_path):
		push_warning("Scene missing, fallback to StartTown_West")
		scene_path = "res://scenes/StartTown_West.tscn"
		spawn_pos = Vector2(160, 160)
	GameState.player.scene = scene_path.get_file().trim_suffix(".tscn")
	if spawn_pos.x >= 0:
		GameState.player.position = spawn_pos
	get_tree().change_scene_to_file(scene_path)
