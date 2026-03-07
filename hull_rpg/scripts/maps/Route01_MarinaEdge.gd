extends "res://scripts/maps/MapBase.gd"

func build_map() -> void:
	scene_name = "Route01_MarinaEdge"
	fill_rect(0, 0, 0, 29, 19, T_BOARD)
	fill_rect(0, 0, 13, 29, 19, T_WATER2)
	fill_rect(0, 5, 0, 10, 4, T_GRASS)
	for x in range(0, 30):
		tilemap.set_cell(1, Vector2i(x, 12), 0, T_RAIL)
	add_sign(Vector2i(4, 5), "marina_sign")
	add_npc(Vector2i(10, 8), "starttown_sign_welcome", 0)
	add_gate(Vector2i(1, 8), "StartTown_West", Vector2(864, 256))
