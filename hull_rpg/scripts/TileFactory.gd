extends Node
class_name TileFactory

static var cached_tileset: TileSet

static func get_world_tileset() -> TileSet:
	if cached_tileset:
		return cached_tileset
	var ts := TileSet.new()
	var atlas := TileSetAtlasSource.new()
	atlas.texture = load("res://assets/tiles/world_tiles.png")
	atlas.texture_region_size = Vector2i(32, 32)
	for y in 2:
		for x in 8:
			atlas.create_tile(Vector2i(x, y))
	ts.add_source(atlas, 0)
	cached_tileset = ts
	return ts
