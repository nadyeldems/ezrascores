extends "res://scripts/maps/MapBase.gd"

func build_map() -> void:
	scene_name = "PrincesQuay_TopDeck"
	fill_rect(0, 0, 0, 29, 19, T_MALL2)
	fill_rect(0, 2, 3, 27, 16, T_MALL1)
	fill_rect(0, 4, 4, 10, 8, T_STOREFRONT)
	fill_rect(0, 12, 4, 18, 8, T_STOREFRONT)
	fill_rect(0, 20, 4, 26, 8, T_STOREFRONT)
	fill_rect(0, 9, 11, 21, 14, T_MALL2)
	for x in range(6, 24):
		tilemap.set_cell(1, Vector2i(x, 10), 0, T_RAIL)
	tilemap.set_cell(1, Vector2i(14, 15), 0, T_ESC)
	add_sign(Vector2i(5, 5), "pq_topdeck_food")
	add_sign(Vector2i(14, 5), "pq_topdeck_cinema")
	add_npc(Vector2i(10, 12), "pq_topdeck_food", 0)
	add_npc(Vector2i(18, 12), "pq_topdeck_cinema", 2)
	add_gate(Vector2i(14, 16), "PrincesQuay_Interior", Vector2(480, 160))
