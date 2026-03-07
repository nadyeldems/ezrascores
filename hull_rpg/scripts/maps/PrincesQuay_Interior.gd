extends "res://scripts/maps/MapBase.gd"

func build_map() -> void:
	scene_name = "PrincesQuay_Interior"
	fill_rect(0, 0, 0, 29, 19, T_MALL1)
	fill_rect(0, 2, 2, 27, 17, T_MALL2)
	fill_rect(0, 4, 3, 10, 7, T_STOREFRONT)
	fill_rect(0, 12, 3, 18, 7, T_STOREFRONT)
	fill_rect(0, 20, 3, 26, 7, T_STOREFRONT)
	fill_rect(0, 11, 8, 18, 13, T_COBBLE)
	for x in range(10, 20):
		tilemap.set_cell(1, Vector2i(x, 8), 0, T_RAIL)
	tilemap.set_cell(1, Vector2i(13, 14), 0, T_ESC)
	tilemap.set_cell(1, Vector2i(16, 14), 0, T_ESC)
	add_sign(Vector2i(5, 9), "pq_interior_topdeck")
	add_sign(Vector2i(9, 9), "pq_interior_water")
	add_sign(Vector2i(20, 9), "pq_interior_meeting")
	add_npc(Vector2i(7, 12), "pq_interior_water", 1)
	add_npc(Vector2i(22, 12), "pq_interior_meeting", 2)
	add_gate(Vector2i(14, 15), "PrincesQuay_TopDeck", Vector2(448, 512))
	add_gate(Vector2i(14, 18), "PrincesQuay_Exterior", Vector2(448, 224))
