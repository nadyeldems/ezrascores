extends CanvasLayer

@onready var panel: Panel = $Panel
@onready var label: Label = $Panel/MarginContainer/Label
@onready var choice_box: VBoxContainer = $ChoiceBox

var lines: Array = []
var index := 0
var callback: Callable

func _ready() -> void:
	add_to_group("dialogue_ui")
	panel.visible = false
	choice_box.visible = false

func show_lines(input_lines: Array) -> void:
	lines = input_lines
	index = 0
	panel.visible = true
	choice_box.visible = false
	label.text = str(lines[0])

func show_choice(question: String, options: Array, cb: Callable) -> void:
	callback = cb
	for c in choice_box.get_children():
		c.queue_free()
	choice_box.visible = true
	panel.visible = true
	label.text = question
	for i in options.size():
		var btn := Button.new()
		btn.text = options[i]
		btn.pressed.connect(func() -> void:
			choice_box.visible = false
			panel.visible = false
			if callback.is_valid():
				callback.call(i)
		)
		choice_box.add_child(btn)

func _unhandled_input(event: InputEvent) -> void:
	if not panel.visible:
		return
	if choice_box.visible:
		return
	if event.is_action_pressed("confirm") or event.is_action_pressed("interact"):
		index += 1
		if index >= lines.size():
			panel.visible = false
		else:
			label.text = str(lines[index])
