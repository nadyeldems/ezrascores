extends Node

var dialogue_data := {}

func _ready() -> void:
	var path := "res://data/dialogues.json"
	if FileAccess.file_exists(path):
		dialogue_data = JSON.parse_string(FileAccess.get_file_as_string(path)).get("dialogues", {})

func get_lines(dialogue_id: String) -> Array:
	if dialogue_data.has(dialogue_id):
		return dialogue_data[dialogue_id]
	return ["..."]
