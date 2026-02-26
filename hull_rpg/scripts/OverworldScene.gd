extends Node2D

@export var scene_name := ""
@export var autoplay_ambience := true

func _ready() -> void:
	if scene_name == "":
		scene_name = scene_file_path.get_file().trim_suffix(".tscn")
	GameState.player.scene = scene_name
	if autoplay_ambience:
		AudioManager.play_ambience(scene_name)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_F5:
				SaveManager.save_game(0, true)
			KEY_1:
				SaveManager.save_game(1, false)
			KEY_2:
				SaveManager.save_game(2, false)
			KEY_3:
				SaveManager.save_game(3, false)
			KEY_F9:
				SaveManager.load_game(1, false)
