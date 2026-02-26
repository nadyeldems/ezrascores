extends Node

var ambience_player: AudioStreamPlayer
var sfx_player: AudioStreamPlayer

func _ready() -> void:
	ambience_player = AudioStreamPlayer.new()
	sfx_player = AudioStreamPlayer.new()
	add_child(ambience_player)
	add_child(sfx_player)

func play_ambience(scene_name: String) -> void:
	var path := "res://audio/%s.wav" % scene_name
	if ResourceLoader.exists(path):
		ambience_player.stream = load(path)
		ambience_player.play()
	else:
		ambience_player.stop()

func play_click() -> void:
	var path := "res://audio/ui_click.wav"
	if ResourceLoader.exists(path):
		sfx_player.stream = load(path)
		sfx_player.play()
