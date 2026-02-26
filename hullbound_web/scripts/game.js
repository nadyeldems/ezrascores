const TILE = 32;
const WIDTH = 30;
const HEIGHT = 20;
const SAVE_VERSION = 1;

const atlasMap = {
  grass: [0, 0], water1: [1, 0], water2: [2, 0], board: [3, 0], cobble: [4, 0], brick: [5, 0],
  mall1: [6, 0], mall2: [7, 0], rail: [0, 1], escalator: [1, 1], sign: [2, 1], storefront: [3, 1]
};

const blockedTiles = new Set(["water1", "water2", "rail", "storefront"]);

const state = {
  data: null,
  sceneName: "StartTown_West",
  map: null,
  player: {
    x: 5 * TILE,
    y: 5 * TILE,
    speed: 120,
    facing: "down",
    animTime: 0,
    frame: 0,
    tile: { x: 5, y: 5 },
    lastSafeSpawn: { scene: "StartTown_West", position: { x: 5 * TILE, y: 5 * TILE } }
  },
  party: [],
  inventory: {},
  worldFlags: { quests: {}, gates_opened: {}, trial_completed: false, key_items_obtained: {} },
  npcStates: { defeated_trainers: {}, one_time_dialogues: {}, ronnie_last_seen: -100000 },
  roaming: { rng_seed: 777, step_counter: 0, rare_counter: 0 },
  timeSteps: { total_steps: 0, clock_hours: 8, clock_minutes: 0 },
  input: { up: false, down: false, left: false, right: false, interact: false, menu: false },
  dialogue: { open: false, lines: [], index: 0, onDone: null },
  choice: { open: false, onPick: null },
  battle: { open: false, enemy: null, enemyHp: 0 },
  ambience: null
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  scene: document.getElementById("hud-scene"),
  clock: document.getElementById("hud-clock"),
  steps: document.getElementById("hud-steps"),
  dialogue: document.getElementById("dialogue"),
  dialogueText: document.getElementById("dialogue-text"),
  choiceList: document.getElementById("choice-list"),
  battle: document.getElementById("battle"),
  battleLog: document.getElementById("battle-log"),
  menu: document.getElementById("menu")
};

const images = {
  tiles: loadImage("./assets/tiles/world_tiles.png"),
  player: loadImage("./assets/sprites/player_sheet.png"),
  npc: loadImage("./assets/sprites/npc_sheet.png")
};
const tileFallbackColor = {
  grass: "#4f8f4d", water1: "#2c75b8", water2: "#3d8bcf", board: "#7a5332", cobble: "#8b8177",
  brick: "#8d5440", mall1: "#c3c3bd", mall2: "#d8d8df", rail: "#9da3a8", escalator: "#9ea0a7",
  sign: "#c9a877", storefront: "#a58c7a"
};

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function lcg() {
  state.roaming.rng_seed = (state.roaming.rng_seed * 1664525 + 1013904223) >>> 0;
  return state.roaming.rng_seed / 0x100000000;
}

function intRand(min, max) {
  return Math.floor(lcg() * (max - min + 1)) + min;
}

function makeGrid(fill) {
  return Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => fill));
}

function fillRect(layer, x0, y0, x1, y1, tile) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) layer[y][x] = tile;
  }
}

function baseMap(sceneName, baseTile) {
  const layer0 = makeGrid(baseTile);
  const layer1 = makeGrid(null);
  return { sceneName, layer0, layer1, entities: [], encounterEnabled: true };
}

function buildScene(sceneName) {
  const s = sceneName;
  let map;
  if (s === "StartTown_West") {
    map = baseMap(s, "cobble");
    fillRect(map.layer0, 0, 14, 29, 16, "board");
    fillRect(map.layer0, 0, 17, 29, 19, "water1");
    fillRect(map.layer0, 9, 0, 14, 5, "grass");
    for (let x = 0; x < WIDTH; x++) map.layer1[16][x] = "rail";
    map.entities.push(
      sign(3, 3, "starttown_sign_welcome"),
      npc(8, 8, "marina_sign", 1),
      gate(28, 8, "Route01_MarinaEdge", 64, 256),
      gate(1, 8, "Route02_FoundersLane", 864, 256),
      gate(15, 2, "TrialHall_West", 160, 320),
      gate(20, 12, "PrincesQuay_Exterior", 128, 320)
    );
  } else if (s === "Route01_MarinaEdge") {
    map = baseMap(s, "board");
    fillRect(map.layer0, 0, 13, 29, 19, "water2");
    fillRect(map.layer0, 5, 0, 10, 4, "grass");
    for (let x = 0; x < WIDTH; x++) map.layer1[12][x] = "rail";
    map.entities.push(sign(4, 5, "marina_sign"), npc(10, 8, "starttown_sign_welcome", 0), gate(1, 8, "StartTown_West", 864, 256));
  } else if (s === "Route02_FoundersLane") {
    map = baseMap(s, "brick");
    fillRect(map.layer0, 3, 2, 12, 8, "cobble");
    fillRect(map.layer0, 19, 0, 29, 6, "grass");
    map.entities.push(sign(6, 3, "founders_sign"), npc(16, 8, "founders_sign", 2), gate(28, 8, "StartTown_West", 64, 256));
  } else if (s === "TrialHall_West") {
    map = baseMap(s, "mall1");
    map.encounterEnabled = false;
    fillRect(map.layer0, 5, 2, 24, 17, "mall2");
    for (let x = 5; x < 25; x++) map.layer1[8][x] = "rail";
    map.entities.push(sign(7, 4, "trialhall_sign"), npc(10, 10, "trialhall_sign", 1), trialKeeper(16, 10), gate(1, 10, "StartTown_West", 480, 96));
  } else if (s === "PrincesQuay_Exterior") {
    map = baseMap(s, "board");
    map.encounterEnabled = false;
    fillRect(map.layer0, 0, 14, 29, 19, "water1");
    fillRect(map.layer0, 8, 5, 21, 12, "mall1");
    for (let x = 7; x < 23; x++) map.layer1[13][x] = "rail";
    map.entities.push(sign(9, 8, "pq_exterior_sign"), npc(17, 9, "pq_exterior_sign", 1), gate(14, 6, "PrincesQuay_Interior", 480, 512), gate(2, 8, "StartTown_West", 672, 384));
  } else if (s === "PrincesQuay_TopDeck") {
    map = baseMap(s, "mall2");
    map.encounterEnabled = false;
    fillRect(map.layer0, 2, 3, 27, 16, "mall1");
    fillRect(map.layer0, 4, 4, 10, 8, "storefront");
    fillRect(map.layer0, 12, 4, 18, 8, "storefront");
    fillRect(map.layer0, 20, 4, 26, 8, "storefront");
    fillRect(map.layer0, 9, 11, 21, 14, "mall2");
    for (let x = 6; x < 24; x++) map.layer1[10][x] = "rail";
    map.layer1[15][14] = "escalator";
    map.entities.push(
      sign(5, 5, "pq_topdeck_food"),
      sign(14, 5, "pq_topdeck_cinema"),
      npc(10, 12, "pq_topdeck_food", 0),
      npc(18, 12, "pq_topdeck_cinema", 2),
      gate(14, 16, "PrincesQuay_Interior", 480, 160)
    );
  } else if (s === "PrincesQuay_Interior") {
    map = baseMap(s, "mall1");
    map.encounterEnabled = false;
    fillRect(map.layer0, 2, 2, 27, 17, "mall2");
    fillRect(map.layer0, 4, 3, 10, 7, "storefront");
    fillRect(map.layer0, 12, 3, 18, 7, "storefront");
    fillRect(map.layer0, 20, 3, 26, 7, "storefront");
    fillRect(map.layer0, 11, 8, 18, 13, "cobble");
    for (let x = 10; x < 20; x++) map.layer1[8][x] = "rail";
    map.layer1[14][13] = "escalator";
    map.layer1[14][16] = "escalator";
    map.entities.push(
      sign(5, 9, "pq_interior_topdeck"),
      sign(9, 9, "pq_interior_water"),
      sign(20, 9, "pq_interior_meeting"),
      npc(7, 12, "pq_interior_water", 1),
      npc(22, 12, "pq_interior_meeting", 2),
      gate(14, 15, "PrincesQuay_TopDeck", 448, 512),
      gate(14, 18, "PrincesQuay_Exterior", 448, 224)
    );
  } else {
    map = buildScene("StartTown_West");
  }

  maybeAddRonnie(map);
  return map;
}

function sign(x, y, dialogueId) { return { kind: "sign", x, y, dialogueId }; }
function npc(x, y, dialogueId, frame = 0) { return { kind: "npc", x, y, dialogueId, frame }; }
function gate(x, y, targetScene, spawnX, spawnY) { return { kind: "gate", x, y, targetScene, spawnX, spawnY }; }
function trialKeeper(x, y) { return { kind: "trial_keeper", x, y, frame: 0 }; }

function maybeAddRonnie(map) {
  if (!["StartTown_West", "Route02_FoundersLane"].includes(map.sceneName)) return;
  const hoursSince = gameHoursTotal() - state.npcStates.ronnie_last_seen;
  if (hoursSince < 24) return;
  if (lcg() >= 0.33) return;
  if (map.sceneName === "StartTown_West") map.entities.push({ kind: "ronnie", x: 12, y: 8, frame: 2 });
  else map.entities.push({ kind: "ronnie", x: 20, y: 10, frame: 2 });
}

function isBlocked(px, py) {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  if (tx < 0 || ty < 0 || tx >= WIDTH || ty >= HEIGHT) return true;
  const base = state.map.layer0[ty][tx];
  const top = state.map.layer1[ty][tx];
  if (blockedTiles.has(base)) return true;
  if (top && blockedTiles.has(top)) return true;
  return false;
}

function update(dt) {
  if (state.dialogue.open || state.battle.open || state.choice.open) return;

  let dx = 0;
  let dy = 0;
  if (state.input.left) dx -= 1;
  if (state.input.right) dx += 1;
  if (state.input.up) dy -= 1;
  if (state.input.down) dy += 1;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  if (dx || dy) {
    if (Math.abs(dx) > Math.abs(dy)) state.player.facing = dx > 0 ? "right" : "left";
    else state.player.facing = dy > 0 ? "down" : "up";

    const speed = state.player.speed * dt;
    const nx = state.player.x + dx * speed;
    const ny = state.player.y + dy * speed;
    if (!isBlocked(nx, state.player.y)) state.player.x = nx;
    if (!isBlocked(state.player.x, ny)) state.player.y = ny;
    state.player.animTime += dt;
    state.player.frame = 1 + Math.floor((state.player.animTime * 8) % 3);
  } else {
    state.player.frame = 0;
  }

  const newTile = { x: Math.floor(state.player.x / TILE), y: Math.floor(state.player.y / TILE) };
  if (newTile.x !== state.player.tile.x || newTile.y !== state.player.tile.y) {
    state.player.tile = newTile;
    state.roaming.step_counter += 1;
    state.timeSteps.total_steps += 1;
    state.timeSteps.clock_minutes += 2;
    while (state.timeSteps.clock_minutes >= 60) {
      state.timeSteps.clock_minutes -= 60;
      state.timeSteps.clock_hours = (state.timeSteps.clock_hours + 1) % 24;
    }
    if (state.timeSteps.total_steps % 40 === 0) saveGame(0, true);
    tryEncounter();
    checkGate();
  }

  if (state.input.interact) {
    state.input.interact = false;
    doInteract();
  }
}

function checkGate() {
  for (const e of state.map.entities) {
    if (e.kind !== "gate") continue;
    if (e.x === state.player.tile.x && e.y === state.player.tile.y) {
      state.player.lastSafeSpawn = { scene: e.targetScene, position: { x: e.spawnX, y: e.spawnY } };
      saveGame(0, true);
      changeScene(e.targetScene, e.spawnX, e.spawnY);
      return;
    }
  }
}

function doInteract() {
  const ahead = facingTile();
  const e = state.map.entities.find((ent) => ent.x === ahead.x && ent.y === ahead.y && ent.kind !== "gate");
  if (!e) return;

  if (e.kind === "sign" || e.kind === "npc") {
    showLines(getDialogue(e.dialogueId));
  } else if (e.kind === "trial_keeper") {
    if (state.worldFlags.trial_completed) showLines(["Lumi: You've already proven your tidecraft."]);
    else showChoice("Challenge Cultural Trial vs Lumi?", ["Begin Trial", "Not yet"], (i) => {
      if (i === 0) startBattle({ creature: "lumi", level: 18, trainer: true });
    });
  } else if (e.kind === "ronnie") {
    showChoice("Ronnie Pickering?", ["Ronnie Pickering?", "Never mind"], (i) => {
      if (i === 0) {
        showLines(["Yeah. Me."]);
        state.npcStates.ronnie_last_seen = gameHoursTotal();
        state.map.entities = state.map.entities.filter((x) => x !== e);
      }
    });
  }
}

function tryEncounter() {
  const tables = state.data.encounters.tables;
  if (!state.map.encounterEnabled || !tables[state.sceneName]) return;
  if (intRand(1, 18) !== 1) return;
  const table = tables[state.sceneName];
  let total = 0;
  for (const t of table) total += t.weight;
  let pick = intRand(1, total);
  for (const t of table) {
    pick -= t.weight;
    if (pick <= 0) {
      startBattle({ creature: t.creature, level: intRand(t.min_level, t.max_level), trainer: false });
      return;
    }
  }
}

function startBattle(enemy) {
  state.battle.open = true;
  state.battle.enemy = enemy;
  const c = state.data.creaturesById[enemy.creature];
  state.battle.enemyHp = c.base_hp + enemy.level * 3;
  ui.battle.classList.remove("hidden");
  ui.battleLog.textContent = `A ${enemy.trainer ? "trial" : "wild"} ${c.name} appears at Lv.${enemy.level}!`;
}

function battleMove() {
  const p = state.party[0];
  const moveId = p.moves[0];
  const move = state.data.movesById[moveId];
  const enemy = state.battle.enemy;
  const enemyData = state.data.creaturesById[enemy.creature];
  const mult = typeMultiplier(move.type, enemyData.types);
  const dmg = Math.max(1, Math.floor(move.power * mult));
  state.battle.enemyHp -= dmg;
  ui.battleLog.textContent = `${p.nickname} used ${move.name} for ${dmg} damage.`;
  if (state.battle.enemyHp <= 0) {
    if (enemy.creature === "lumi") state.worldFlags.trial_completed = true;
    p.xp += 12;
    endBattle(true);
    return;
  }
  enemyTurn();
}

function enemyTurn() {
  const p = state.party[0];
  const dmg = 5 + Math.floor(state.battle.enemy.level / 2);
  p.hp = Math.max(0, p.hp - dmg);
  ui.battleLog.textContent += `\nEnemy strikes for ${dmg}.`;
  if (p.hp <= 0) {
    p.hp = p.max_hp;
    endBattle(false);
  }
}

function battleItem() {
  if ((state.inventory.chip_spice || 0) > 0) {
    state.inventory.chip_spice -= 1;
    const p = state.party[0];
    p.hp = Math.min(p.max_hp, p.hp + 20);
    ui.battleLog.textContent = "Used Chip Spice. HP restored.";
    enemyTurn();
  } else {
    ui.battleLog.textContent = "No Chip Spice left.";
  }
}

function battleRun() {
  if (intRand(1, 100) <= 65) endBattle(false);
  else {
    ui.battleLog.textContent = "Could not run!";
    enemyTurn();
  }
}

function endBattle(victory) {
  ui.battleLog.textContent += victory ? "\nVictory!" : "\nBattle ended.";
  setTimeout(() => {
    state.battle.open = false;
    state.battle.enemy = null;
    ui.battle.classList.add("hidden");
  }, 500);
}

function typeMultiplier(moveType, defenderTypes) {
  const chart = {
    Water: { Earth: 1.2, Grass: 0.7 }, Grass: { Water: 1.5, Earth: 1.3, Air: 0.8 },
    Electric: { Water: 1.5, Air: 1.4, Earth: 0.6 }, Earth: { Electric: 1.6, Steel: 1.2, Air: 0.6 },
    Air: { Grass: 1.3, Steel: 0.8 }, Light: { Psychic: 1.3 }
  };
  let m = 1;
  for (const t of defenderTypes) if (chart[moveType]?.[t]) m *= chart[moveType][t];
  return m;
}

function facingTile() {
  const t = { ...state.player.tile };
  if (state.player.facing === "up") t.y -= 1;
  else if (state.player.facing === "down") t.y += 1;
  else if (state.player.facing === "left") t.x -= 1;
  else t.x += 1;
  return t;
}

function showLines(lines, onDone = null) {
  state.dialogue = { open: true, lines, index: 0, onDone };
  ui.dialogue.classList.remove("hidden");
  ui.choiceList.innerHTML = "";
  ui.dialogueText.textContent = lines[0] || "...";
}

function showChoice(question, options, onPick) {
  state.dialogue.open = true;
  state.choice.open = true;
  state.choice.onPick = onPick;
  ui.dialogue.classList.remove("hidden");
  ui.dialogueText.textContent = question;
  ui.choiceList.innerHTML = "";
  options.forEach((opt, idx) => {
    const b = document.createElement("button");
    b.textContent = opt;
    b.onclick = () => {
      closeDialogue();
      onPick(idx);
    };
    ui.choiceList.appendChild(b);
  });
}

function advanceDialogue() {
  if (!state.dialogue.open || state.choice.open) return;
  state.dialogue.index += 1;
  if (state.dialogue.index >= state.dialogue.lines.length) {
    const done = state.dialogue.onDone;
    closeDialogue();
    if (done) done();
  } else {
    ui.dialogueText.textContent = state.dialogue.lines[state.dialogue.index];
  }
}

function closeDialogue() {
  state.dialogue.open = false;
  state.choice.open = false;
  state.choice.onPick = null;
  ui.dialogue.classList.add("hidden");
}

function getDialogue(id) {
  return state.data.dialogues[id] || ["..."];
}

function changeScene(sceneName, x, y) {
  const valid = ["StartTown_West", "Route01_MarinaEdge", "Route02_FoundersLane", "TrialHall_West", "PrincesQuay_Exterior", "PrincesQuay_TopDeck", "PrincesQuay_Interior"];
  if (!valid.includes(sceneName)) {
    sceneName = "StartTown_West";
    x = 5 * TILE;
    y = 5 * TILE;
  }
  state.sceneName = sceneName;
  state.map = buildScene(sceneName);
  state.player.x = x;
  state.player.y = y;
  state.player.tile = { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
  playAmbience(sceneName);
}

function playAmbience(sceneName) {
  if (state.ambience) {
    state.ambience.pause();
    state.ambience = null;
  }
  const scenes = ["StartTown_West", "Route01_MarinaEdge", "Route02_FoundersLane", "PrincesQuay_Exterior", "PrincesQuay_TopDeck", "PrincesQuay_Interior"];
  if (!scenes.includes(sceneName)) return;
  state.ambience = new Audio(`./audio/${sceneName}.wav`);
  state.ambience.loop = true;
  state.ambience.volume = 0.25;
  state.ambience.play().catch(() => {});
}

function render(ts) {
  if (!state.map) {
    ctx.fillStyle = "#0a2a48";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const waterAnim = Math.floor(ts / 400) % 2 === 0 ? "water1" : "water2";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let t0 = state.map.layer0[y][x];
      let t1 = state.map.layer1[y][x];
      if (t0 === "water1" || t0 === "water2") t0 = waterAnim;
      drawTile(t0, x, y);
      if (t1) drawTile(t1, x, y);
    }
  }

  for (const e of state.map.entities) {
    if (e.kind === "sign") drawTile("sign", e.x, e.y);
    else if (["npc", "trial_keeper", "ronnie"].includes(e.kind)) drawNpc(e.x, e.y, e.frame || 0);
  }

  drawPlayer();
  drawBattleCreature();
  updateHud();
}

function drawTile(key, tx, ty) {
  if (!key || !atlasMap[key]) return;
  if (!images.tiles.complete || images.tiles.naturalWidth === 0) {
    ctx.fillStyle = tileFallbackColor[key] || "#777";
    ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    return;
  }
  const [ax, ay] = atlasMap[key];
  ctx.drawImage(images.tiles, ax * TILE, ay * TILE, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE);
}

function drawNpc(tx, ty, frame) {
  if (!images.npc.complete || images.npc.naturalWidth === 0) {
    ctx.fillStyle = "#b88";
    ctx.fillRect(tx * TILE + 8, ty * TILE + 6, 16, 24);
    return;
  }
  ctx.drawImage(images.npc, frame * TILE, 0, TILE, TILE, tx * TILE, ty * TILE, TILE, TILE);
}

function drawPlayer() {
  if (!images.player.complete || images.player.naturalWidth === 0) {
    ctx.fillStyle = "#67a6dc";
    ctx.fillRect(Math.round(state.player.x) + 8, Math.round(state.player.y) + 6, 16, 24);
    return;
  }
  const rowByFacing = { down: 0, up: 1, left: 2, right: 3 };
  const row = rowByFacing[state.player.facing] || 0;
  const col = state.player.frame;
  ctx.drawImage(images.player, col * TILE, row * TILE, TILE, TILE, Math.round(state.player.x), Math.round(state.player.y), TILE, TILE);
}

function drawBattleCreature() {
  if (!state.battle.open || !state.battle.enemy) return;
  const id = state.battle.enemy.creature;
  if (!images[id]) images[id] = loadImage(`./assets/sprites/${id}.png`);
  ctx.drawImage(images[id], 640, 120, 128, 128);
}

function updateHud() {
  ui.scene.textContent = `Scene: ${state.sceneName}`;
  ui.steps.textContent = `Steps: ${state.timeSteps.total_steps}`;
  const h = String(state.timeSteps.clock_hours).padStart(2, "0");
  const m = String(state.timeSteps.clock_minutes).padStart(2, "0");
  ui.clock.textContent = `${h}:${m}`;
}

function gameHoursTotal() {
  return state.timeSteps.clock_hours + Math.floor(state.timeSteps.total_steps / 30);
}

function buildSavePayload() {
  return {
    save_version: SAVE_VERSION,
    player: {
      position: { x: state.player.x, y: state.player.y },
      tile: { ...state.player.tile },
      facing: state.player.facing,
      current_scene: state.sceneName,
      last_safe_spawn: state.player.lastSafeSpawn
    },
    party: state.party,
    inventory: state.inventory,
    world_flags: state.worldFlags,
    npc_states: state.npcStates,
    roaming: state.roaming,
    time_steps: state.timeSteps
  };
}

function migrateSave(payload) {
  const out = { ...payload };
  if (typeof out.save_version !== "number") out.save_version = 0;
  if (out.save_version === 0) {
    if (!out.time_steps) out.time_steps = { total_steps: 0, clock_hours: 8, clock_minutes: 0 };
    if (!out.roaming) out.roaming = { rng_seed: 777, step_counter: 0, rare_counter: 0 };
    out.save_version = 1;
  }
  return out;
}

function validateSave(payload) {
  const req = ["save_version", "player", "party", "inventory", "world_flags", "npc_states", "roaming", "time_steps"];
  return req.every((k) => payload && Object.prototype.hasOwnProperty.call(payload, k));
}

function saveGame(slot, autosave = false) {
  const target = autosave ? 0 : slot;
  if (!autosave && (target < 1 || target > 3)) return false;
  const payload = buildSavePayload();
  localStorage.setItem(`hullbound_save_slot_${target}`, JSON.stringify(payload));
  return true;
}

function loadGame(slot, autosave = false) {
  const target = autosave ? 0 : slot;
  const raw = localStorage.getItem(`hullbound_save_slot_${target}`);
  if (!raw) return false;
  let payload;
  try {
    payload = migrateSave(JSON.parse(raw));
  } catch {
    return false;
  }
  if (!validateSave(payload)) return false;

  state.party = payload.party;
  state.inventory = payload.inventory;
  state.worldFlags = payload.world_flags;
  state.npcStates = payload.npc_states;
  state.roaming = payload.roaming;
  state.timeSteps = payload.time_steps;

  const p = payload.player;
  const scene = p.current_scene || "StartTown_West";
  const sx = p.position?.x ?? 5 * TILE;
  const sy = p.position?.y ?? 5 * TILE;
  state.player.facing = p.facing || "down";
  state.player.lastSafeSpawn = p.last_safe_spawn || { scene: "StartTown_West", position: { x: 5 * TILE, y: 5 * TILE } };
  changeScene(scene, sx, sy);
  return true;
}

function seedInitialState() {
  state.party = [{
    creature_id: "spratlet", nickname: "Spratlet", level: 5, hp: 40, max_hp: 40, status: "", xp: 0,
    moves: ["splash_jab", "mist_pulse"], evolution_state: "base"
  }];
  state.inventory = {
    chip_spice: 3, pattie_bun: 1, fog_lantern: 1, dock_rope: 1, fair_token: 2, marina_pass: 0, founders_key: 0,
    silt_vial: 1, traffic_cone: 2, hull_fc_scarf: 1, hull_kr_badge: 1, quay_map: 1, tram_ticket: 1, bridge_pin: 1,
    seaglass: 2, market_tea: 2, dock_battery: 1, canal_chalk: 1, cinema_stub: 0, meeting_token: 0
  };
}

function bindUi() {
  window.addEventListener("keydown", (e) => {
    if (e.key === "w" || e.key === "ArrowUp") state.input.up = true;
    if (e.key === "s" || e.key === "ArrowDown") state.input.down = true;
    if (e.key === "a" || e.key === "ArrowLeft") state.input.left = true;
    if (e.key === "d" || e.key === "ArrowRight") state.input.right = true;
    if (e.key === "e" || e.key === "Enter") {
      if (state.dialogue.open) advanceDialogue();
      else state.input.interact = true;
    }
    if (e.key === "Escape") toggleMenu();
    if (e.key === "1") saveGame(1, false);
    if (e.key === "2") saveGame(2, false);
    if (e.key === "3") saveGame(3, false);
    if (e.key === "F5") saveGame(0, true);
    if (e.key === "F9") loadGame(1, false);
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "w" || e.key === "ArrowUp") state.input.up = false;
    if (e.key === "s" || e.key === "ArrowDown") state.input.down = false;
    if (e.key === "a" || e.key === "ArrowLeft") state.input.left = false;
    if (e.key === "d" || e.key === "ArrowRight") state.input.right = false;
  });

  document.getElementById("btn-fight").onclick = () => battleMove();
  document.getElementById("btn-item").onclick = () => battleItem();
  document.getElementById("btn-run").onclick = () => battleRun();
  document.querySelectorAll("[data-save]").forEach((b) => { b.onclick = () => saveGame(Number(b.dataset.save), false); });
  document.querySelectorAll("[data-load]").forEach((b) => { b.onclick = () => loadGame(Number(b.dataset.load), false); });
  document.getElementById("btn-autosave").onclick = () => saveGame(0, true);

  document.querySelectorAll(".touch-controls button").forEach((b) => {
    const act = b.dataset.act;
    const press = () => {
      if (act === "interact") {
        if (state.dialogue.open) advanceDialogue();
        else state.input.interact = true;
      } else if (act === "menu") toggleMenu();
      else state.input[act] = true;
    };
    const release = () => {
      if (["up", "down", "left", "right"].includes(act)) state.input[act] = false;
    };
    b.addEventListener("pointerdown", press);
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("pointerleave", release);
  });
}

function toggleMenu() {
  ui.menu.classList.toggle("hidden");
}

async function loadData() {
  const readJson = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return res.json();
  };
  const [creatures, moves, items, encounters, trainers, dialogues] = await Promise.all([
    readJson("./data/creatures.json"),
    readJson("./data/moves.json"),
    readJson("./data/items.json"),
    readJson("./data/encounters.json"),
    readJson("./data/trainers.json"),
    readJson("./data/dialogues.json")
  ]);

  state.data = {
    creatures: creatures.creatures,
    moves: moves.moves,
    items: items.items,
    encounters,
    trainers: trainers.trainers,
    dialogues: dialogues.dialogues,
    creaturesById: Object.fromEntries(creatures.creatures.map((c) => [c.id, c])),
    movesById: Object.fromEntries(moves.moves.map((m) => [m.id, m])),
    itemsById: Object.fromEntries(items.items.map((i) => [i.id, i]))
  };
}

let prev = 0;
function loop(ts) {
  const dt = Math.min(0.033, (ts - prev) / 1000 || 0);
  prev = ts;
  update(dt);
  render(ts);
  requestAnimationFrame(loop);
}

async function start() {
  try {
    bindUi();
    await loadData();
    seedInitialState();
    changeScene("StartTown_West", state.player.x, state.player.y);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    ui.dialogue.classList.remove("hidden");
    ui.dialogueText.textContent = `Startup error: ${err.message}\nRun from a local server in /hullbound_web (npm run dev) and open http://localhost:8787`;
  }
}

start();
