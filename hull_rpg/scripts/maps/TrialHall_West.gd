extends "res://scripts/maps/MapBase.gd"

func build_map() -> void:
	scene_name = "TrialHall_West"
	fill_rect(0, 0, 0, 29, 19, T_MALL1)
	fill_rect(0, 5, 2, 24, 17, T_MALL2)
	for x in range(5, 25):
		tilemap.set_cell(1, Vector2i(x, 8), 0, T_RAIL)
	add_sign(Vector2i(7, 4), "trialhall_sign")
	add_npc(Vector2i(10, 10), "trialhall_sign", 1)
	_add_trial_keeper(Vector2i(16, 10))
	add_gate(Vector2i(1, 10), "StartTown_West", Vector2(480, 96))

func _add_trial_keeper(tile_pos: Vector2i) -> void:
	var keeper := Area2D.new()
	keeper.position = Vector2(tile_pos.x * 32 + 16, tile_pos.y * 32 + 16)
	var cs := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(20, 20)
	cs.shape = shape
	keeper.add_child(cs)
	var spr := Sprite2D.new()
	spr.texture = load("res://assets/sprites/npc_sheet.png")
	spr.hframes = 3
	spr.frame = 0
	keeper.add_child(spr)
	keeper.set_script(load("res://scripts/TrialKeeper.gd"))
	props.add_child(keeper)
