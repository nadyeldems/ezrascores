extends CharacterBody2D

@export var speed := 120.0
@onready var anim: AnimatedSprite2D = $AnimatedSprite2D
@onready var ray: RayCast2D = $InteractRay

var facing := "down"
var step_accum := 0.0

func _ready() -> void:
	global_position = GameState.player.position
	facing = GameState.player.facing
	_update_anim(Vector2.ZERO)

func _physics_process(delta: float) -> void:
	var dir := Vector2(
		Input.get_action_strength("move_right") - Input.get_action_strength("move_left"),
		Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
	)
	if dir.length() > 1.0:
		dir = dir.normalized()
	velocity = dir * speed
	move_and_slide()
	if dir != Vector2.ZERO:
		step_accum += delta * speed
		if step_accum >= 32.0:
			step_accum = 0.0
			GameState.advance_steps(1)
			if GameState.time_steps.total_steps % 40 == 0:
				SaveManager.save_game(0, true)
			if EncounterManager.can_encounter(_scene_name()) and randi() % 18 == 0:
				var encounter := EncounterManager.roll_encounter(_scene_name())
				if not encounter.is_empty():
					GameState.player.position = global_position
					BattleManager.start_wild_battle(encounter)
					return
	_update_anim(dir)
	_update_interact_ray()
	GameState.player.position = global_position
	GameState.player.tile = Vector2i(int(global_position.x / 32.0), int(global_position.y / 32.0))
	GameState.player.facing = facing

	if Input.is_action_just_pressed("interact"):
		_interact()

func _update_anim(dir: Vector2) -> void:
	if abs(dir.x) > abs(dir.y):
		facing = "right" if dir.x > 0 else "left"
	elif dir.y != 0:
		facing = "down" if dir.y > 0 else "up"

	if dir == Vector2.ZERO:
		anim.play("idle_%s" % facing)
	else:
		anim.play("walk_%s" % facing)

func _update_interact_ray() -> void:
	match facing:
		"up": ray.target_position = Vector2(0, -20)
		"down": ray.target_position = Vector2(0, 20)
		"left": ray.target_position = Vector2(-20, 0)
		"right": ray.target_position = Vector2(20, 0)

func _interact() -> void:
	ray.force_raycast_update()
	if ray.is_colliding():
		var col := ray.get_collider()
		if col and col.has_method("interact"):
			col.interact()

func _scene_name() -> String:
	return get_tree().current_scene.scene_file_path.get_file().trim_suffix(".tscn")
