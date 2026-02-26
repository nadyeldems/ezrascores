extends "res://scripts/maps/MapBase.gd"

func build_map() -> void:
	scene_name = "Route02_FoundersLane"
	fill_rect(0, 0, 0, 29, 19, T_BRICK)
	fill_rect(0, 3, 2, 12, 8, T_COBBLE)
	fill_rect(0, 19, 0, 29, 6, T_GRASS)
	add_sign(Vector2i(6, 3), "founders_sign")
	add_npc(Vector2i(16, 8), "founders_sign", 2)
	add_gate(Vector2i(28, 8), "StartTown_West", Vector2(64, 256))
	_add_ronnie(Vector2i(20, 10))

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
