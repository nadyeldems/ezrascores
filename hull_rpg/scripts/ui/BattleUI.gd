extends Control

@onready var log_label: Label = $Panel/Log
@onready var btn_fight: Button = $Panel/Buttons/Fight
@onready var btn_item: Button = $Panel/Buttons/Item
@onready var btn_run: Button = $Panel/Buttons/Run

var moves_data := {}
var creatures_data := {}
var enemy := {}
var player_mon := {}
var enemy_hp := 1

func _ready() -> void:
	_load_data()
	btn_fight.pressed.connect(_on_fight)
	btn_item.pressed.connect(_on_item)
	btn_run.pressed.connect(_on_run)
	_setup_battle()

func _load_data() -> void:
	var mjson: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/moves.json"))
	for m in mjson["moves"]:
		moves_data[m["id"]] = m
	var cjson: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/creatures.json"))
	for c in cjson["creatures"]:
		creatures_data[c["id"]] = c

func _setup_battle() -> void:
	enemy = BattleManager.active_enemy
	if enemy.is_empty() and has_meta("trainer_battle"):
		enemy = get_meta("trainer_battle")
	player_mon = GameState.party[0]
	var enemy_id := enemy.get("creature", "spratlet")
	var ecreature := creatures_data.get(enemy_id, creatures_data["spratlet"])
	enemy_hp = int(ecreature["base_hp"]) + int(enemy.get("level", 5)) * 3
	log_label.text = "A wild %s appears at Lv.%d!" % [ecreature["name"], int(enemy.get("level", 5))]

func _on_fight() -> void:
	var move_id := player_mon["moves"][0]
	var move = moves_data[move_id]
	var ecreature := creatures_data[enemy["creature"]]
	var mult := BattleManager.type_multiplier(move["type"], ecreature["types"])
	var dmg := max(1, int(move["power"] * mult))
	enemy_hp -= dmg
	log_label.text = "%s used %s for %d damage!" % [player_mon["nickname"], move["name"], dmg]
	if enemy_hp <= 0:
		log_label.text += "\nVictory!"
		if enemy.get("creature", "") == "lumi":
			GameState.world_flags.trial_completed = true
		GameState.party[0]["xp"] += 12
		await get_tree().create_timer(0.8).timeout
		BattleManager.end_battle(true)
		return
	_enemy_turn()

func _enemy_turn() -> void:
	var dmg := 5 + int(enemy["level"] / 2)
	GameState.party[0]["hp"] = max(0, int(GameState.party[0]["hp"]) - dmg)
	log_label.text += "\nEnemy strikes for %d." % dmg
	if GameState.party[0]["hp"] <= 0:
		log_label.text += "\nYou blacked out."
		await get_tree().create_timer(0.8).timeout
		GameState.party[0]["hp"] = GameState.party[0]["max_hp"]
		BattleManager.end_battle(false)

func _on_item() -> void:
	if int(GameState.inventory.get("chip_spice", 0)) > 0:
		GameState.inventory["chip_spice"] = int(GameState.inventory["chip_spice"]) - 1
		GameState.party[0]["hp"] = min(int(GameState.party[0]["max_hp"]), int(GameState.party[0]["hp"]) + 20)
		log_label.text = "Used Chip Spice. HP restored."
		_enemy_turn()
	else:
		log_label.text = "No Chip Spice left."

func _on_run() -> void:
	if randi() % 100 < 65:
		log_label.text = "Escaped safely."
		await get_tree().create_timer(0.6).timeout
		BattleManager.end_battle(false)
	else:
		log_label.text = "Could not run!"
		_enemy_turn()
