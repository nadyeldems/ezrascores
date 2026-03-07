extends "res://scripts/maps/MapBase.gd"

func build_map() -> void:
	scene_name = "PrincesQuay_Exterior"
	fill_rect(0, 0, 0, 29, 19, T_BOARD)
	fill_rect(0, 0, 14, 29, 19, T_WATER1)
	fill_rect(0, 8, 5, 21, 12, T_MALL1)
	for x in range(7, 23):
		tilemap.set_cell(1, Vector2i(x, 13), 0, T_RAIL)
	add_sign(Vector2i(9, 8), "pq_exterior_sign")
	add_npc(Vector2i(17, 9), "pq_exterior_sign", 1)
	add_gate(Vector2i(14, 6), "PrincesQuay_Interior", Vector2(480, 512))
	add_gate(Vector2i(2, 8), "StartTown_West", Vector2(672, 384))
