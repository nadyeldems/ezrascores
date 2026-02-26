extends "res://scripts/maps/MapBase.gd"

func build_map() -> void:
	scene_name = "StartTown_West"
	fill_rect(0, 0, 0, 29, 19, T_COBBLE)
	fill_rect(0, 0, 14, 29, 19, T_BOARD)
	fill_rect(0, 0, 17, 29, 19, T_WATER1)
	fill_rect(0, 9, 0, 14, 5, T_GRASS)
	for x in range(0, 30):
		tilemap.set_cell(1, Vector2i(x, 16), 0, T_RAIL)
	add_sign(Vector2i(3, 3), "starttown_sign_welcome")
	add_npc(Vector2i(8, 8), "marina_sign", 1)
	add_gate(Vector2i(28, 8), "Route01_MarinaEdge", Vector2(64, 256))
	add_gate(Vector2i(1, 8), "Route02_FoundersLane", Vector2(864, 256))
	add_gate(Vector2i(15, 2), "TrialHall_West", Vector2(160, 320))
	add_gate(Vector2i(20, 12), "PrincesQuay_Exterior", Vector2(128, 320))
	_add_ronnie(Vector2i(12, 8))

func _add_ronnie(tile_pos: Vector2i) -> void:
	var ronnie := Area2D.new()
	ronnie.position = Vector2(tile_pos.x * 32 + 16, tile_pos.y * 32 + 16)
	var cs := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(20, 20)
	cs.shape = shape
	ronnie.add_child(cs)
	var spr := Sprite2D.new()
	spr.texture = load("res://assets/sprites/npc_sheet.png")
	spr.hframes = 3
	spr.frame = 2
	ronnie.add_child(spr)
	ronnie.set_script(load("res://scripts/RonniePickering.gd"))
	props.add_child(ronnie)
