extends "res://scripts/OverworldScene.gd"

@onready var tilemap: TileMap = $TileMap
@onready var props: Node2D = $Props

const T_GRASS := Vector2i(0,0)
const T_WATER1 := Vector2i(1,0)
const T_WATER2 := Vector2i(2,0)
const T_BOARD := Vector2i(3,0)
const T_COBBLE := Vector2i(4,0)
const T_BRICK := Vector2i(5,0)
const T_MALL1 := Vector2i(6,0)
const T_MALL2 := Vector2i(7,0)
const T_RAIL := Vector2i(0,1)
const T_ESC := Vector2i(1,1)
const T_SIGN := Vector2i(2,1)
const T_STOREFRONT := Vector2i(3,1)

func _ready() -> void:
	while tilemap.get_layers_count() < 2:
		tilemap.add_layer(tilemap.get_layers_count())
	tilemap.tile_set = TileFactory.get_world_tileset()
	tilemap.clear()
	super._ready()
	build_map()
	build_boundaries()

func build_map() -> void:
	pass

func build_boundaries() -> void:
	var w := 32 * 30
	var h := 32 * 20
	_add_wall(Vector2(w / 2, -8), Vector2(w, 16))
	_add_wall(Vector2(w / 2, h + 8), Vector2(w, 16))
	_add_wall(Vector2(-8, h / 2), Vector2(16, h))
	_add_wall(Vector2(w + 8, h / 2), Vector2(16, h))

func _add_wall(pos: Vector2, size: Vector2) -> void:
	var body := StaticBody2D.new()
	body.position = pos
	var cs := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = size
	cs.shape = rect
	body.add_child(cs)
	add_child(body)

func fill_rect(layer: int, x0: int, y0: int, x1: int, y1: int, tile: Vector2i) -> void:
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			tilemap.set_cell(layer, Vector2i(x, y), 0, tile)

func add_sign(tile_pos: Vector2i, dialogue_id: String) -> void:
	tilemap.set_cell(1, tile_pos, 0, T_SIGN)
	var sign := Area2D.new()
	sign.position = Vector2(tile_pos.x * 32 + 16, tile_pos.y * 32 + 16)
	var cs := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(26, 26)
	cs.shape = shape
	sign.add_child(cs)
	sign.set_script(load("res://scripts/Interactable.gd"))
	sign.dialogue_id = dialogue_id
	props.add_child(sign)

func add_npc(tile_pos: Vector2i, dialogue_id: String, frame: int = 0) -> void:
	var npc := Area2D.new()
	npc.position = Vector2(tile_pos.x * 32 + 16, tile_pos.y * 32 + 16)
	var cs := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(20, 20)
	cs.shape = shape
	npc.add_child(cs)
	var spr := Sprite2D.new()
	spr.texture = load("res://assets/sprites/npc_sheet.png")
	spr.hframes = 3
	spr.frame = frame
	npc.add_child(spr)
	npc.set_script(load("res://scripts/Interactable.gd"))
	npc.dialogue_id = dialogue_id
	props.add_child(npc)

func add_gate(tile_pos: Vector2i, target: String, spawn: Vector2) -> void:
	var gate := Area2D.new()
	gate.position = Vector2(tile_pos.x * 32 + 16, tile_pos.y * 32 + 16)
	var cs := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = Vector2(32, 32)
	cs.shape = shape
	gate.add_child(cs)
	gate.set_script(load("res://scripts/SceneGate.gd"))
	gate.target_scene = target
	gate.spawn_position = spawn
	props.add_child(gate)
