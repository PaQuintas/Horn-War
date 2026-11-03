const LEVELS = [50, 45, 42, 38, 35, 32, 30];
const BLOCKS_PER_TOWER = 10;
const ROOM_SESSION_KEY = "horn-war-room-session";

const elements = {
  mainMenu: document.querySelector("#main-menu"),
  modeMenu: document.querySelector("#mode-menu"),
  botSetup: document.querySelector("#bot-setup"),
  onlineMenu: document.querySelector("#online-menu"),
  roomLobby: document.querySelector("#room-lobby"),
  instructionsScreen: document.querySelector("#instructions-screen"),
  campaignLevelScreen: document.querySelector("#campaign-level-screen"),
  gameScreen: document.querySelector("#game-screen"),
  campaignName: document.querySelector("#campaign-player-name"),
  difficulty: document.querySelector("#cpu-difficulty"),
  roomLevel: document.querySelector("#room-level-select"),
  roomLevelRange: document.querySelector("#room-level-range"),
  roomBlindTowers: document.querySelector("#room-blind-towers"),
  roomPlayerCount: document.querySelector("#room-player-count"),
  onlineName: document.querySelector("#online-player-name"),
  blindTowers: document.querySelector("#blind-towers"),
  blindBotTowers: document.querySelector("#blind-bot-towers"),
  roomCodeInput: document.querySelector("#room-code-input"),
  onlineError: document.querySelector("#online-error"),
  roomCodeDisplay: document.querySelector("#room-code-display"),
  roomPlayerList: document.querySelector("#room-player-list"),
  roomLobbyStatus: document.querySelector("#room-lobby-status"),
  startRoom: document.querySelector("#start-room"),
  onlineGameStatus: document.querySelector("#online-game-status"),
  abandon: document.querySelector("#abandon-game"),
  towers: {
    human: document.querySelector("#human-tower"),
    cpu: document.querySelector("#cpu-tower"),
    player2: document.querySelector("#cpu-tower"),
    player3: document.querySelector("#third-tower"),
    player4: document.querySelector("#fourth-tower")
  },
  panels: [...document.querySelectorAll(".player-panel")],
  hunters: [...document.querySelectorAll(".hunter")],
  rockScene: document.querySelector(".rock-scene"),
  battlefield: document.querySelector(".battlefield"),
  humanLabel: document.querySelector("#human-label"),
  cpuLabel: document.querySelector("#cpu-label"),
  campaignProgress: document.querySelector("#campaign-progress"),
  campaignLevelTitle: document.querySelector("#campaign-level-title"),
  campaignLevelDescription: document.querySelector("#campaign-level-description"),
  roundStart: document.querySelector("#round-start"),
  roundStartLabel: document.querySelector("#round-start-label"),
  roundRange: document.querySelector("#round-range"),
  beginRound: document.querySelector("#begin-round"),
  rouletteWheel: document.querySelector(".roulette-wheel"),
  rouletteSymbol: document.querySelector("#roulette-wheel-symbol"),
  rouletteResult: document.querySelector("#roulette-result"),
  title: document.querySelector("#turn-title"),
  status: document.querySelector("#status-message"),
  cannonStatus: document.querySelector("#cannon-status"),
  numberActions: document.querySelector("#number-actions"),
  choices: document.querySelector("#opening-choices"),
  visibleChoice: document.querySelector("#opening-visible"),
  visibleNumber: document.querySelector("#opening-visible-number"),
  randomChoice: document.querySelector("#opening-hidden"),
  randomSymbol: document.querySelector("#opening-hidden-symbol"),
  passLabel: document.querySelector("#pass-label"),
  result: document.querySelector("#round-result"),
  resultAction: document.querySelector("#result-action"),
  resultExit: document.querySelector("#result-exit"),
  resultOverlay: document.querySelector("#victory-overlay")
};

let state;
let campaign = { mode: "bot", levelIndex: 0, difficulty: "medium", playerName: "Jugador 1" };
let currentRoom;
let localPlayerId = "human";

function showScreen(screenId) {
  for (const screen of [elements.mainMenu, elements.modeMenu, elements.botSetup, elements.onlineMenu, elements.roomLobby, elements.instructionsScreen, elements.campaignLevelScreen, elements.gameScreen]) {
    screen.hidden = screen.id !== screenId;
  }
  document.body.classList.toggle("game-active", screenId === "game-screen");
}

function showOnlineError(message) {
  elements.onlineError.textContent = message;
  elements.onlineError.hidden = !message;
}

function slotId(seatIndex) {
  return ["human", "player2", "player3", "player4"][seatIndex];
}

function levelMaximum(levelIndex, playerCount = 2) {
  return Math.round(LEVELS[levelIndex] * playerCount / 2);
}

async function roomRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  const body = { ...options.body };
  if (currentRoom?.userId) body.playerId = currentRoom.userId;
  const response = await fetch(`/api${path}`, {
    method: options.method || "GET",
    headers,
    ...(options.method && options.method !== "GET" ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Error del servidor (${response.status}).`);
  return payload;
}

function clearSavedRoomSession() {
  try {
    localStorage.removeItem(ROOM_SESSION_KEY);
  } catch (error) {
    console.error("Could not clear the saved room session.", error);
  }
}

async function fetchRoom(roomId, playerId = currentRoom?.userId) {
  const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
  const { room } = await roomRequest(`/rooms/${encodeURIComponent(roomId)}${query}`);
  return room;
}

function renderRoomLobby() {
  elements.roomCodeDisplay.textContent = currentRoom.code;
  elements.roomPlayerList.replaceChildren();
  for (const player of currentRoom.players) {
    const item = document.createElement("li");
    item.textContent = `${player.player_name}${player.user_id === currentRoom.host_id ? " · anfitrión" : ""}`;
    elements.roomPlayerList.append(item);
  }
  const count = currentRoom.players.length;
  elements.roomPlayerCount.textContent = `${count} de 4 jugadores unidos`;
  elements.roomLevel.replaceChildren(...LEVELS.map((_, levelIndex) => {
    const option = document.createElement("option");
    const maximum = levelMaximum(levelIndex, Math.max(count, 2));
    option.value = String(levelIndex);
    option.textContent = `Nivel ${levelIndex + 1} · 1–${maximum}`;
    return option;
  }));
  elements.roomLevel.value = String(currentRoom.level_index);
  elements.roomLevel.disabled = !currentRoom.isHost || currentRoom.status !== "waiting";
  elements.roomBlindTowers.checked = Boolean(currentRoom.blind_mode);
  elements.roomBlindTowers.disabled = !currentRoom.isHost || currentRoom.status !== "waiting";
  elements.roomLevelRange.textContent =
    `Rango para ${Math.max(count, 2)} jugadores: del 1 al ${levelMaximum(currentRoom.level_index, Math.max(count, 2))}. Se recalculará si cambia el número de participantes.`;
  elements.roomLobbyStatus.textContent = currentRoom.status === "in_progress"
    ? "La partida ya ha comenzado."
    : `${count} de 4 jugadores · ${count < 2 ? "esperando al menos a otro jugador…" : "pueden unirse más jugadores antes de empezar."}`;
  elements.startRoom.hidden = !currentRoom.isHost || currentRoom.status !== "waiting";
  elements.startRoom.disabled = count < 2 || count > 4;
  if (currentRoom.status === "waiting") showScreen("room-lobby");
}

async function updateRoomLevel() {
  if (!currentRoom?.isHost || currentRoom.status !== "waiting") return;
  const levelIndex = Number(elements.roomLevel.value);
  try {
    await roomRequest(`/rooms/${encodeURIComponent(currentRoom.id)}/level`, {
      method: "PATCH",
      body: { levelIndex }
    });
    currentRoom.level_index = levelIndex;
    renderRoomLobby();
  } catch (error) {
    elements.roomLobbyStatus.textContent = `No se pudo cambiar el nivel: ${error.message}`;
  }
}

async function updateRoomBlindMode() {
  if (!currentRoom?.isHost || currentRoom.status !== "waiting") return;
  const blindMode = elements.roomBlindTowers.checked;
  elements.roomBlindTowers.disabled = true;
  try {
    await roomRequest(`/rooms/${encodeURIComponent(currentRoom.id)}/blind-mode`, {
      method: "PATCH",
      body: { blindMode }
    });
    currentRoom.blind_mode = blindMode;
    renderRoomLobby();
  } catch (error) {
    elements.roomBlindTowers.checked = Boolean(currentRoom.blind_mode);
    elements.roomLobbyStatus.textContent = `No se pudo cambiar la visibilidad de las torres: ${error.message}`;
    elements.roomBlindTowers.disabled = false;
  }
}

function makeRoomChannel() {
  if (!currentRoom) return;
  const roomId = currentRoom.id;
  if (currentRoom.channel) currentRoom.channel.close();
  if (currentRoom.reconnectTimer) clearTimeout(currentRoom.reconnectTimer);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(
    `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomId)}/events?playerId=${encodeURIComponent(currentRoom.userId)}`
  );
  currentRoom.channel = socket;
  socket.addEventListener("open", () => {
    if (currentRoom?.id === roomId) refreshCurrentRoom();
  });
  socket.addEventListener("message", () => {
    if (currentRoom?.id === roomId) refreshCurrentRoom();
  });
  socket.addEventListener("close", () => {
    if (currentRoom?.id !== roomId) return;
    setOnlineGameStatus("Conexión interrumpida. Intentando reconectar…");
    currentRoom.reconnectTimer = window.setTimeout(makeRoomChannel, 2000);
  });
  socket.addEventListener("error", () => {
    setOnlineGameStatus("No se pudo conectar con el servidor de la partida.");
  });
}

async function refreshCurrentRoom() {
  if (!currentRoom) return;
  try {
    const room = await fetchRoom(currentRoom.id, currentRoom.userId);
    currentRoom = {
      ...currentRoom,
      ...room,
      userId: currentRoom.userId,
      isHost: room.host_id === currentRoom.userId,
      channel: currentRoom.channel,
      reconnectTimer: currentRoom.reconnectTimer
    };
    if (room.status === "waiting") {
      renderRoomLobby();
      return;
    }
    if (room.game_state) applyRoomGameState(room.game_state);
  } catch (error) {
    setOnlineGameStatus(`No se pudo actualizar la sala: ${error.message}`);
  }
}

function setOnlineGameStatus(message) {
  elements.onlineGameStatus.textContent = message;
  elements.onlineGameStatus.hidden = !message;
}

function applyRoomGameState(snapshot) {
  if (state?.roomId === currentRoom.id && snapshot.revision <= state.revision) return;
  const previousGameOver = state?.gameOver ?? false;
  const previousCannonShotId = state?.lastCannonShot?.id;
  const shouldAnimateCannon = snapshot.phase === "cannon-firing"
    && snapshot.lastCannonShot?.id
    && snapshot.lastCannonShot.id !== previousCannonShotId;
  state = {
    ...snapshot,
    players: snapshot.players.map(player => ({
      ...player,
      cannonAwarded: Boolean(player.cannonAwarded),
      cannonAvailable: Boolean(player.cannonAvailable),
      cannonProgress: player.cannonProgress ?? [],
      cannonSequence: player.cannonSequence ?? [],
      cannonUsedSequences: player.cannonUsedSequences ?? []
    })),
    available: new Set(snapshot.available),
    cpuTimer: null,
    animationTimers: [],
    roomId: currentRoom.id
  };
  localPlayerId = currentRoom.players.find(player => player.user_id === currentRoom.userId)
    ? slotId(currentRoom.players.find(player => player.user_id === currentRoom.userId).seat_index)
    : null;
  document.body.classList.add("game-multiplayer");
  document.body.classList.remove("players-2", "players-3", "players-4");
  document.body.classList.add(`players-${state.players.length}`);
  elements.battlefield.classList.toggle("blind-mode", state.blindMode);
  elements.battlefield.classList.add("blind-multiplayer");
  elements.battlefield.classList.toggle("four-player-game", state.players.length === 4);
  elements.roundStart.hidden = state.phase !== "ready";
  elements.result.hidden = true;
  elements.resultOverlay.hidden = true;
  showScreen("game-screen");
  render();
  setOnlineGameStatus(`Sala ${currentRoom.code} · ${currentRoom.players.length} jugadores`);
  if (shouldAnimateCannon) animateCannonShot(state.lastCannonShot);
  if (!previousGameOver && state.gameOver) {
    state.animationTimers.push(window.setTimeout(() => animateVictory(state.activePlayer), 150));
  } else if (state.gameOver) {
    elements.result.textContent = state.victoryText;
    elements.result.hidden = false;
    elements.resultOverlay.hidden = false;
    elements.resultAction.hidden = !state.victoryAction || !currentRoom.isHost;
    elements.resultAction.disabled = !currentRoom.isHost;
    elements.resultExit.hidden = false;
  }
}

function serializeGameState() {
  return {
    ...state,
    available: [...state.available],
    cpuTimer: null,
    animationTimers: []
  };
}

async function persistOnlineGameState() {
  if (!state?.roomId || !currentRoom) return;
  const expectedRevision = state.revision;
  state.revision += 1;
  const snapshot = serializeGameState();
  try {
    await roomRequest(`/rooms/${encodeURIComponent(currentRoom.id)}/state`, {
      method: "PUT",
      body: { expectedRevision, gameState: snapshot }
    });
  } catch (error) {
    state.revision = expectedRevision;
    if (error.message.includes("desactualizada")) {
      setOnlineGameStatus("La partida cambió en otro dispositivo. Se está sincronizando.");
      await refreshCurrentRoom();
      return;
    }
    setOnlineGameStatus(`No se pudo guardar la jugada: ${error.message}`);
    throw error;
  }
}

async function openRoom(roomRecord) {
  if (!roomRecord) throw new Error("El servidor no devolvió los datos de la sala.");
  const room = await fetchRoom(roomRecord.room_id, roomRecord.player_id);
  currentRoom = {
    ...room,
    userId: roomRecord.player_id,
    isHost: room.host_id === roomRecord.player_id,
    channel: null,
    reconnectTimer: null
  };
  try {
    localStorage.setItem(ROOM_SESSION_KEY, JSON.stringify({
      roomId: currentRoom.id,
      playerId: currentRoom.userId
    }));
  } catch (error) {
    console.error("Could not save the room session locally.", error);
  }
  localPlayerId = slotId(roomRecord.seat_index);
  showOnlineError("");
  renderRoomLobby();
  makeRoomChannel();
}

async function createOnlineRoom() {
  showOnlineError("");
  try {
    const result = await roomRequest("/rooms", {
      method: "POST",
      body: {
        playerName: elements.onlineName.value.trim() || "Jugador 1",
        levelIndex: 0,
        blindMode: false
      }
    });
    await openRoom(result);
  } catch (error) {
    showOnlineError(error.message);
  }
}

async function joinOnlineRoom() {
  showOnlineError("");
  const code = elements.roomCodeInput.value.trim();
  if (!/^\d{4}$/.test(code)) {
    showOnlineError("Introduce un código válido de cuatro cifras.");
    return;
  }
  try {
    const result = await roomRequest("/rooms/join", {
      method: "POST",
      body: {
        code,
        playerName: elements.onlineName.value.trim() || "Jugador"
      }
    });
    await openRoom(result);
  } catch (error) {
    showOnlineError(error.message);
  }
}

async function startOnlineRoom() {
  if (!currentRoom?.isHost || currentRoom.players.length < 2 || currentRoom.players.length > 4) return;
  try {
    await roomRequest(`/rooms/${encodeURIComponent(currentRoom.id)}/start`, { method: "POST" });
    currentRoom.status = "in_progress";
    newGame("multiplayer", currentRoom.level_index, "medium", currentRoom.players);
    showScreen("game-screen");
    setOnlineGameStatus(`Sala ${currentRoom.code} · ${currentRoom.players.length} jugadores`);
    await persistOnlineGameState();
  } catch (error) {
    elements.roomLobbyStatus.textContent = `No se pudo iniciar: ${error.message}`;
  }
}

async function leaveOnlineRoom() {
  if (!currentRoom) return;
  const roomId = currentRoom.id;
  const channel = currentRoom.channel;
  const reconnectTimer = currentRoom.reconnectTimer;
  try {
    await roomRequest(`/rooms/${encodeURIComponent(roomId)}/leave`, { method: "POST" });
    currentRoom = null;
    clearSavedRoomSession();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (channel) channel.close();
    localPlayerId = "human";
    document.body.classList.remove("game-multiplayer");
    document.body.classList.remove("players-2", "players-3", "players-4");
    elements.battlefield.classList.remove("blind-mode", "blind-multiplayer", "four-player-game", "cpu-game");
    setOnlineGameStatus("");
    showScreen("online-menu");
  } catch (error) {
    elements.roomLobbyStatus.textContent = `No se pudo salir de la sala: ${error.message}`;
  }
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function takeRandomAvailable() {
  const numbers = [...state.available];
  if (numbers.length === 0) return null;
  const number = numbers[Math.floor(Math.random() * numbers.length)];
  state.available.delete(number);
  return number;
}

function prepareTurn(player) {
  state.activePlayer = player;
  state.choiceNumber = null;
  state.choiceSource = null;
  state.randomRevealed = false;

  const currentPlayer = getPlayer(player);
  const sequence = currentPlayer && findConsecutiveSet(currentPlayer);
  if (sequence) {
    currentPlayer.cannonAvailable = true;
    currentPlayer.cannonSequence = sequence;
    currentPlayer.cannonProgress = [];
    state.phase = "choose-cannon-target";
    return;
  }
  state.phase = "choose-number";

  if (state.offered !== null) {
    state.choiceNumber = state.offered;
    state.choiceSource = "offer";
  } else {
    state.choiceNumber = takeRandomAvailable();
    if (state.choiceNumber !== null) state.choiceSource = "available";
  }
}

function newGame(mode, levelIndex, difficulty = elements.difficulty.value, onlinePlayers = null) {
  const previousRoomRevision = onlinePlayers && state?.roomId === currentRoom?.id
    ? state.revision
    : -1;
  if (state?.cpuTimer !== null && state?.cpuTimer !== undefined) clearTimeout(state.cpuTimer);
  state?.animationTimers?.forEach(timer => clearTimeout(timer));
  elements.panels.forEach(panel => {
    panel.classList.remove("tower-under-attack");
    panel.querySelector(".tower")?.classList.remove("tower-collapsing");
    panel.querySelector(".summit-hunter")?.classList.remove("summit-archer-drawing", "hunter-suspended", "hunter-falling");
  });
  elements.hunters.forEach(hunter => hunter.classList.remove("hunter-archer", "hunter-falling", "hunter-suspended"));
  elements.battlefield.querySelectorAll(".fire-arrow-generated, .victory-smoke-generated, .cannon-effect").forEach(effect => effect.remove());
  elements.roundStart.classList.remove("roulette-running");
  elements.rouletteWheel.classList.remove("roulette-spinning");
  elements.rouletteSymbol.textContent = "?";
  elements.rouletteResult.textContent = "Pulsa comenzar para sortear quién empieza.";
  elements.roundStart.hidden = false;
  elements.beginRound.disabled = false;
  elements.beginRound.textContent = "Comenzar";
  const isMultiplayer = mode === "multiplayer";
  const playerCount = onlinePlayers?.length ?? (isMultiplayer ? 3 : 2);
  const maximum = levelMaximum(levelIndex, isMultiplayer ? playerCount : 2);
  const dealtNumbers = shuffled(Array.from({ length: maximum }, (_, index) => index + 1));
  const seatIds = ["human", "player2", "player3", "player4"];
  const players = onlinePlayers
    ? onlinePlayers.map((roomPlayer, index) => ({
      id: seatIds[index],
      userId: roomPlayer.user_id,
      name: roomPlayer.player_name,
      tower: dealtNumbers.slice(index * BLOCKS_PER_TOWER, (index + 1) * BLOCKS_PER_TOWER),
      cannonAwarded: false,
      cannonAvailable: false,
      cannonProgress: [],
      cannonSequence: [],
      cannonUsedSequences: []
    }))
    : (isMultiplayer ? seatIds.slice(0, 3) : ["human", "cpu"]).map((id, index) => ({
      id,
      name: id === "human"
        ? isMultiplayer ? `Jugador ${index + 1}` : campaign.playerName
        : id === "cpu" ? "CPU" : `Jugador ${index + 1}`,
      tower: dealtNumbers.slice(index * BLOCKS_PER_TOWER, (index + 1) * BLOCKS_PER_TOWER),
      cannonAwarded: false,
      cannonAvailable: false,
      cannonProgress: [],
      cannonSequence: [],
      cannonUsedSequences: []
    }));
  state = {
    mode,
    levelIndex,
    maximum,
    difficulty,
    players,
    available: new Set(dealtNumbers.slice(BLOCKS_PER_TOWER * players.length)),
    offered: null,
    choiceNumber: null,
    choiceSource: null,
    incoming: null,
    activePlayer: null,
    phase: "ready",
    randomRevealed: false,
    lastMove: null,
    lastCannonShot: null,
    blindMode: onlinePlayers
      ? currentRoom.blind_mode
      : isMultiplayer ? false : elements.blindBotTowers.checked,
    roomId: onlinePlayers ? currentRoom.id : null,
    revision: previousRoomRevision,
    gameOver: false,
    cpuTimer: null,
    animationTimers: []
  };
  document.body.classList.remove("players-2", "players-3", "players-4");
  if (isMultiplayer) document.body.classList.add(`players-${players.length}`);
  localPlayerId = onlinePlayers
    ? players.find(player => player.userId === currentRoom.userId)?.id
    : "human";
  document.body.classList.toggle("game-multiplayer", isMultiplayer);
  elements.battlefield.classList.toggle("cpu-game", mode === "bot");
  elements.battlefield.classList.toggle("blind-mode", state.blindMode);
  elements.battlefield.classList.toggle("blind-multiplayer", isMultiplayer);
  elements.battlefield.classList.toggle("four-player-game", isMultiplayer && players.length === 4);
  elements.campaignProgress.hidden = false;
  elements.campaignProgress.textContent = isMultiplayer
    ? `Multijugador · Nivel ${levelIndex + 1} de ${LEVELS.length}`
    : `Campaña · Nivel ${levelIndex + 1} de ${LEVELS.length}`;
  elements.roundStartLabel.textContent = `Nivel ${levelIndex + 1}`;
  elements.roundRange.textContent = `Números del 1 al ${maximum}`;
  elements.rouletteWheel.style.background = rouletteBackground(players.length);
  elements.resultAction.hidden = true;
  elements.resultExit.hidden = true;
  elements.battlefield.classList.remove("battlefield-victory");
  elements.result.hidden = true;
  elements.resultOverlay.hidden = true;
  render();
}

function getPlayer(playerId) {
  return state.players.find(player => player.id === playerId);
}

function isOrdered(tower) {
  return tower.length === BLOCKS_PER_TOWER
    && tower.every((number, index) => index === 0 || tower[index - 1] > number);
}

function findConsecutiveSet(player) {
  const usedSequences = new Set(player.cannonUsedSequences ?? []);
  for (let index = 0; index <= player.tower.length - 4; index += 1) {
    const sequence = player.tower.slice(index, index + 4);
    if (!sequence.every((number, offset) => number === sequence[0] - offset)) continue;
    const sequenceKey = sequence.join("-");
    if (!usedSequences.has(sequenceKey)) return sequence;
  }
  return null;
}

function inversionCount(tower) {
  let inversions = 0;
  for (let left = 0; left < tower.length; left += 1) {
    for (let right = left + 1; right < tower.length; right += 1) {
      if (tower[left] < tower[right]) inversions += 1;
    }
  }
  return inversions;
}

function blockColors(number, player) {
  const progress = (number - 1) / (state.maximum - 1);
  const palettes = {
    human: { light: [244, 154, 119], dark: [56, 10, 14] },
    cpu: { light: [158, 211, 237], dark: [7, 28, 62] },
    player2: { light: [235, 159, 87], dark: [69, 26, 4] },
    player3: { light: [174, 193, 113], dark: [28, 45, 7] },
    player4: { light: [169, 178, 221], dark: [20, 25, 68] }
  };
  const palette = palettes[player];
  const color = palette.light.map((channel, index) => (
    Math.round(channel + (palette.dark[index] - channel) * progress)
  ));
  const rgb = color.join(", ");
  const highlight = color.map(channel => Math.min(255, Math.round(channel + (255 - channel) * .16))).join(", ");
  const shadow = color.map(channel => Math.round(channel * .76)).join(", ");
  return {
    color: `rgb(${rgb})`,
    light: `rgb(${highlight})`,
    dark: `rgb(${shadow})`,
    size: progress,
    text: "#fffaf0"
  };
}

function summitHunterMarkup(playerId) {
  const colors = playerId === "player2" || playerId === "cpu"
    ? { hat: "hunter-hat-sage", coat: "hunter-coat-gold", belt: "hunter-belt-sage" }
    : playerId === "player3"
      ? { hat: "hunter-hat-rust", coat: "hunter-coat-gold", belt: "hunter-belt-sage" }
      : { hat: "hunter-hat-rust", coat: "", belt: "hunter-belt-rust" };
  const sword = playerId === "player3"
    ? '<path class="summit-sword" d="M66 51 L48 73 L52 77 L71 56 Z M67 58 L75 64 M70 54 L77 59"/>'
    : playerId === "player2" || playerId === "cpu"
      ? '<path class="summit-sword" d="M29 70 L12 48 L9 51 L23 75 L25 80 L30 76 Z M31 73 L21 81 M29 77 L34 82"/>'
      : '<path class="summit-sword" d="M61 70 L78 48 L81 51 L67 75 L65 80 L60 76 Z M59 73 L69 81 M61 77 L56 82"/>';
  const cannon = playerId === "cpu" || playerId === "player2"
    ? '<path class="summit-cannon" d="M24 54 L10 49 L8 55 L22 61 Z M12 51 L7 49 L5 53 L10 56 Z"/>'
    : '<path class="summit-cannon" d="M60 54 L74 49 L76 55 L62 61 Z M72 51 L77 49 L79 53 L74 56 Z"/>';
  return `<svg class="summit-hunter summit-hunter-${playerId}" viewBox="0 0 90 80" aria-hidden="true">
    <path class="summit-bow" d="M70 42 Q85 57 70 72"/>
    <circle class="hunter-face" cx="43" cy="31" r="13"/>
    <path class="hunter-hat ${colors.hat}" d="M27 27 Q43 7 59 27 L57 31 L29 31 Z M34 20 L50 20 L43 12 Z"/>
    <path class="hunter-coat ${colors.coat}" d="M34 43 L52 43 L62 79 L24 79 Z"/>
    <path class="hunter-belt ${colors.belt}" d="M27 68 L59 68 L60 75 L26 75 Z"/>
    <path class="hunter-arm" d="M34 47 L24 55 L28 70 L35 67 L32 57 L40 53 Z M51 47 L61 51 L63 61 L56 63 L54 56 L48 54 Z"/>
    ${cannon}
    ${sword}
    <path class="summit-bowstring" d="M70 42 L73 57 L70 72"/>
  </svg>`;
}

function towerMarkup(player) {
  return player.tower.map((number, index) => {
    const canChoose = player.id === state.activePlayer
      && player.id !== "cpu"
      && player.id === localPlayerId
      && state.phase === "choose-block"
      && !state.gameOver;
    const canBeCannonTarget = state.phase === "choose-cannon-target"
      && player.id !== state.activePlayer
      && state.activePlayer === localPlayerId
      && !state.gameOver;
    const lastMoveTarget = state.lastMove?.playerId === player.id
      && state.activePlayer === player.id
      && state.lastMove.index === index;
    const cannonImpactPending = state.phase === "cannon-firing"
      && state.lastCannonShot?.targetPlayerId === player.id
      && state.lastCannonShot.index === index;
    const displayNumber = cannonImpactPending ? state.lastCannonShot.replacedNumber : number;
    const colors = blockColors(displayNumber, player.id);
    const style = `--block-size:${colors.size};--block-color:${colors.color};--block-light:${colors.light};--block-dark:${colors.dark};--block-text:${colors.text};--fall-delay:${index * 80}ms;--fall-x:${index % 2 ? 22 : -22}px;--fall-y:${80 + index * 18}px;--fall-rotation:${index % 2 ? 18 : -16}deg`;
    const summitHunter = index === player.tower.length - 1
      ? summitHunterMarkup(player.id)
      : "";
    const classes = ["block"];
    if (canChoose) classes.push("block-choice-active");
    if (canBeCannonTarget) classes.push("cannon-target-block");
    if (cannonImpactPending) classes.push("cannon-impact-pending");
    if (lastMoveTarget) classes.push("last-placement-target");
    const cannonStar = player.cannonAvailable && player.cannonSequence.includes(number)
      ? '<span class="cannon-sequence-star" aria-hidden="true">★</span>'
      : "";
    return `<button class="${classes.join(" ")}" style="${style}" type="button" data-index="${index}" aria-label="bloque ${displayNumber}" ${canChoose || canBeCannonTarget ? "" : "disabled"}><span>${displayNumber}</span>${cannonStar}<span class="placement-arrow" aria-hidden="true">➜</span>${summitHunter}</button>`;
  }).join("");
}

function render() {
  const secondPanel = elements.panels.find(panel => panel.classList.contains("cpu-panel"));
  secondPanel.dataset.player = state.mode === "multiplayer" ? "player2" : "cpu";
  elements.hunters.find(hunter => hunter.classList.contains("hunter-right")).dataset.hunter =
    state.mode === "multiplayer" ? "player2" : "cpu";
  for (const panel of elements.panels) {
    const playerId = panel.dataset.player;
    const player = getPlayer(playerId);
    panel.hidden = !player;
    if (player) elements.towers[playerId].innerHTML = towerMarkup(player);
  }
  elements.humanLabel.textContent = state.mode === "multiplayer" ? getPlayer("human")?.name ?? "Jugador 1" : "Tú";
  elements.cpuLabel.textContent = state.mode === "multiplayer" ? getPlayer("player2")?.name ?? "Jugador 2" : "CPU";
  elements.rockScene.classList.toggle("cpu-game", state.mode === "bot");
  elements.rockScene.setAttribute(
    "aria-label",
    state.mode === "multiplayer"
      ? `${state.players.length} cazadores con trompas naturales sobre una roca`
      : "Un cazador con trompa natural sobre una roca"
  );
  elements.towers.human.setAttribute("aria-label", state.mode === "multiplayer" ? `Torre de ${getPlayer("human")?.name ?? "Jugador 1"}, de la base a la cima` : "Tu torre, de la base a la cima");
  elements.towers.cpu.setAttribute("aria-label", state.mode === "multiplayer" ? `Torre de ${getPlayer("player2")?.name ?? "Jugador 2"}, de la base a la cima` : "Torre de la CPU, de la base a la cima");
  elements.panels.forEach(panel => {
    const player = getPlayer(panel.dataset.player);
    const heading = panel.querySelector(".player-heading h2");
    panel.querySelector(".tower-reference")?.remove();
    if (player) heading.textContent = player.name;
    const towerHidden = Boolean(player && state.blindMode && state.lastMove && !state.gameOver && player.id !== localPlayerId);
    const cannonTargeting = Boolean(
      player
      && state.phase === "choose-cannon-target"
      && player.id !== state.activePlayer
      && state.activePlayer === localPlayerId
    );
    const canTargetReference = cannonTargeting;
    panel.classList.toggle("tower-hidden", towerHidden);
    panel.classList.toggle("cannon-targeting", cannonTargeting);
    if (towerHidden) {
      const tower = panel.querySelector(".tower");
      const summit = tower?.querySelector(".summit-hunter");
      if (tower) {
        const panelBox = panel.getBoundingClientRect();
        const towerBox = tower.getBoundingClientRect();
        const reference = document.createElement("div");
        reference.className = "tower-reference";
        if (canTargetReference) {
          reference.setAttribute("aria-label", `Torre de referencia de ${player.name}`);
        } else {
          reference.setAttribute("aria-hidden", "true");
        }
        reference.style.left = `${towerBox.left - panelBox.left}px`;
        reference.style.top = `${towerBox.top - panelBox.top}px`;
        reference.style.width = `${towerBox.width}px`;
        reference.style.height = `${towerBox.height}px`;
        reference.classList.toggle("tower-reference-targeting", canTargetReference);
        player.tower.forEach((_, index) => {
          const block = document.createElement(canTargetReference ? "button" : "span");
          const orderedNumber = state.maximum - index;
          const progress = (orderedNumber - 1) / (state.maximum - 1);
          const sourceBlock = tower.querySelector(`.block[data-index="${index}"]`);
          const sourceRect = sourceBlock.getBoundingClientRect();
          const referenceWidth = towerBox.width * (.38 + progress * .62);
          const referenceLeft = (towerBox.width - referenceWidth) / 2;
          block.className = "tower-reference-block";
          block.dataset.index = String(index);
          if (canTargetReference) {
            block.type = "button";
            block.setAttribute("aria-label", `Disparar al bloque ${index + 1} de ${player.name}`);
          }
          block.style.left = `${referenceLeft}px`;
          block.style.top = `${sourceRect.top - towerBox.top}px`;
          block.style.width = `${referenceWidth}px`;
          block.style.height = `${sourceRect.height}px`;
          if (
            state.lastMove?.playerId === player.id
            && state.activePlayer === player.id
            && state.lastMove.index === index
            || state.phase === "cannon-firing"
              && state.lastCannonShot?.targetPlayerId === player.id
              && state.lastCannonShot.index === index
          ) {
            const arrow = document.createElement("span");
            arrow.className = "tower-reference-arrow";
            arrow.textContent = "➜";
            block.append(arrow);
          }
          reference.append(block);
        });
        if (summit) {
          const summitBox = summit.getBoundingClientRect();
          const hunter = summit.cloneNode(true);
          hunter.classList.add("tower-reference-hunter");
          hunter.style.left = `${summitBox.left - towerBox.left}px`;
          hunter.style.top = `${summitBox.top - towerBox.top}px`;
          reference.append(hunter);
        }
        panel.append(reference);
      }
    }
  });

  const activePlayer = getPlayer(state.activePlayer);
  const humanTurn = activePlayer?.id === localPlayerId && !state.gameOver;
  const choosingNumber = humanTurn && state.phase === "choose-number";
  const choosingBlock = humanTurn && state.phase === "choose-block";
  const retainLastMove = Boolean(state.lastMove && state.phase !== "ready" && !state.gameOver);
  const choosingCannonTarget = !state.gameOver && state.phase === "choose-cannon-target";
  const cannonFiring = !state.gameOver && state.phase === "cannon-firing";
  elements.choices.hidden = state.gameOver || choosingCannonTarget || cannonFiring;
  elements.choices.classList.remove("choice-cards-single");
  const displayedNumber = state.incoming ?? state.choiceNumber ?? state.lastMove?.number ?? "";
  elements.visibleNumber.textContent = displayedNumber;
  elements.visibleChoice.disabled = !choosingNumber || state.choiceNumber === null;
  elements.visibleChoice.classList.toggle("choice-card-selected", choosingBlock);
  elements.visibleChoice.setAttribute(
    "aria-label",
    choosingBlock
      ? `Número elegido ${state.incoming}; elige un bloque`
      : !humanTurn && retainLastMove
        ? `Último número colocado ${state.lastMove.number}`
        : `Escoger número ${state.choiceNumber ?? ""}`
  );
  elements.randomChoice.hidden = false;
  elements.randomChoice.disabled = !choosingNumber
    || (state.randomRevealed ? false : state.available.size === 0);
  elements.randomSymbol.textContent = state.randomRevealed ? "↷" : "?";
  elements.passLabel.hidden = !state.randomRevealed;
  elements.randomChoice.classList.toggle("choice-card-pass", state.randomRevealed);
  elements.randomChoice.classList.remove("choice-card-selected");
  elements.randomChoice.setAttribute(
    "aria-label",
    state.randomRevealed ? "Pasar turno" : "Revelar otro número aleatorio"
  );
  elements.cannonStatus.hidden = !choosingCannonTarget && !cannonFiring;
  elements.cannonStatus.textContent = choosingCannonTarget
    ? "¡Cañonazo disponible! Elige un bloque rival."
    : cannonFiring
      ? `${getPlayer(state.activePlayer)?.name ?? "El cazador"} dispara el cañón…`
      : "";
  elements.title.textContent = state.gameOver
    ? "Fin de la partida"
    : choosingCannonTarget ? "Elige un objetivo"
      : cannonFiring ? "Disparo de cañón"
        : state.phase === "ready" ? "Preparados"
      : activePlayer?.id === localPlayerId
        ? "Tu turno" : `Turno de ${activePlayer?.name ?? ""}`;
  elements.status.textContent = state.gameOver
    ? "La partida ha terminado."
    : choosingCannonTarget ? "Elige un bloque de la torre de un rival para disparar."
      : cannonFiring ? "El cañón está disparando."
    : state.phase === "ready" ? "Pulsa comenzar para sortear quién empieza."
      : choosingBlock ? "Elige un bloque de tu torre."
        : activePlayer?.id === "cpu" ? "Turno de la CPU."
          : `${activePlayer?.name ?? ""}: elige un número o revela uno aleatorio.`;
  if (state.cpuTimer !== null) clearTimeout(state.cpuTimer);
  if (state.activePlayer === "cpu" && !state.gameOver) {
    if (state.phase === "choose-number") state.cpuTimer = setTimeout(cpuMove, 800);
    if (state.phase === "choose-cannon-target") state.cpuTimer = setTimeout(cpuFireCannon, 850);
  }
  elements.beginRound.disabled = state.phase !== "ready" || Boolean(currentRoom && !currentRoom.isHost);
}

function startRoundRoulette() {
  if (state.phase !== "ready") return;
  elements.beginRound.disabled = true;
  elements.roundStart.classList.add("roulette-running");
  elements.rouletteWheel.classList.add("roulette-spinning");
  elements.rouletteResult.textContent = "La suerte está decidiendo quién empieza…";
  const starter = state.players[Math.floor(Math.random() * state.players.length)];
  elements.rouletteSymbol.textContent = "★";
  elements.rouletteWheel.style.background = rouletteBackground(state.players.length);
  state.animationTimers.push(window.setTimeout(() => {
    elements.rouletteWheel.classList.remove("roulette-spinning");
    elements.rouletteResult.textContent = `${starter.name} empieza`;
    state.animationTimers.push(window.setTimeout(() => {
      state.activePlayer = starter.id;
      prepareTurn(starter.id);
      elements.roundStart.hidden = true;
      elements.roundStart.classList.remove("roulette-running");
      render();
      persistOnlineGameState().catch(error => console.error("Could not save the round start.", error));
    }, 850));
  }, 1850));
}

function rouletteBackground(playerCount) {
  const colors = ["#984b2c", "#305777", "#a87935", "#557347"];
  const slice = 360 / playerCount;
  const segments = colors.slice(0, playerCount).map((color, index) => {
    const start = index * slice;
    return `${color} ${start}deg ${start + slice}deg`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function chooseCurrentNumber() {
  if (
    state.gameOver
    || state.activePlayer !== localPlayerId
    || state.phase !== "choose-number"
    || state.choiceNumber === null
  ) return;

  if (state.choiceSource === "offer") state.offered = null;
  state.incoming = state.choiceNumber;
  state.choiceNumber = null;
  state.choiceSource = null;
  state.phase = "choose-block";
  render();
  persistOnlineGameState().catch(error => console.error("Could not save the chosen number.", error));
}

function revealRandomNumber() {
  if (
    state.gameOver
    || state.activePlayer !== localPlayerId
    || state.phase !== "choose-number"
    || state.randomRevealed
  ) return;

  if (state.choiceSource === "offer") state.offered = null;
  state.choiceNumber = takeRandomAvailable();
  state.choiceSource = state.choiceNumber === null ? null : "available";
  state.randomRevealed = true;
  render();
  persistOnlineGameState().catch(error => console.error("Could not save the random choice.", error));
}

function passTurn() {
  if (
    state.gameOver
    || state.activePlayer !== localPlayerId
    || state.phase !== "choose-number"
    || !state.randomRevealed
  ) return;

  if (state.choiceSource === "available" && state.choiceNumber !== null) {
    state.available.add(state.choiceNumber);
  }
  state.offered = null;
  state.choiceNumber = null;
  state.choiceSource = null;
  state.randomRevealed = false;
  prepareNextTurn();
  render();
  persistOnlineGameState().catch(error => console.error("Could not save the passed turn.", error));
}

function prepareNextTurn() {
  const activeIndex = state.players.findIndex(player => player.id === state.activePlayer);
  const nextPlayer = state.players[(activeIndex + 1) % state.players.length];
  prepareTurn(nextPlayer.id);
}

function fireCannon(targetPlayerId, index, actorId = localPlayerId) {
  const attacker = getPlayer(state.activePlayer);
  const target = getPlayer(targetPlayerId);
  if (
    state.gameOver
    || state.phase !== "choose-cannon-target"
    || state.activePlayer !== actorId
    || !attacker?.cannonAvailable
    || !target
    || target.id === attacker.id
    || !Number.isInteger(index)
    || index < 0
    || index >= target.tower.length
  ) return;

  const replacementNumber = takeRandomAvailable();
  if (replacementNumber === null) return;
  const replacedNumber = target.tower[index];
  target.tower[index] = replacementNumber;
  state.available.add(replacedNumber);
  attacker.cannonAvailable = false;
  attacker.cannonProgress = [];
  attacker.cannonUsedSequences ??= [];
  attacker.cannonUsedSequences.push(attacker.cannonSequence.join("-"));
  attacker.cannonSequence = [];
  state.phase = "cannon-firing";
  state.lastCannonShot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    attackerId: attacker.id,
    targetPlayerId: target.id,
    index,
    number: replacementNumber,
    replacedNumber
  };
  render();
  animateCannonShot(state.lastCannonShot);
  persistOnlineGameState().catch(error => console.error("Could not save the cannon shot.", error));
  const shotId = state.lastCannonShot.id;
  state.animationTimers.push(window.setTimeout(() => completeCannonShot(shotId), 2050));
}

function animateCannonShot(shot) {
  const attackerPanel = elements.panels.find(panel => panel.dataset.player === shot.attackerId);
  const targetPanel = elements.panels.find(panel => panel.dataset.player === shot.targetPlayerId);
  const hunter = attackerPanel?.querySelector(".tower-reference-hunter")
    ?? attackerPanel?.querySelector(".summit-hunter");
  const targetBlock = targetPanel?.querySelector(`.block[data-index="${shot.index}"]`);
  if (!hunter || !targetBlock) return;
  hunter.classList.add("cannon-shooting");

  const boardRect = elements.battlefield.getBoundingClientRect();
  const hunterRect = hunter.getBoundingClientRect();
  const targetRect = targetBlock.getBoundingClientRect();
  const startX = hunterRect.left + hunterRect.width / 2 - boardRect.left;
  const startY = hunterRect.top + hunterRect.height / 2 - boardRect.top;
  const targetX = targetRect.left + targetRect.width / 2 - boardRect.left;
  const targetY = targetRect.top + targetRect.height / 2 - boardRect.top;
  const ball = document.createElement("span");
  ball.className = "cannonball cannon-effect";
  ball.setAttribute("aria-hidden", "true");
  ball.style.left = `${startX}px`;
  ball.style.top = `${startY}px`;
  ball.style.setProperty("--cannon-flight-x", `${targetX - startX}px`);
  ball.style.setProperty("--cannon-flight-y", `${targetY - startY}px`);
  elements.battlefield.append(ball);
  ball.getBoundingClientRect();
  ball.classList.add("cannonball-flying");

  state.animationTimers.push(window.setTimeout(() => {
    hunter.classList.remove("cannon-shooting");
  }, 450));
  state.animationTimers.push(window.setTimeout(() => {
    ball.remove();
    const smoke = document.createElement("span");
    smoke.className = "cannon-smoke cannon-effect";
    smoke.setAttribute("aria-hidden", "true");
    smoke.style.left = `${targetX}px`;
    smoke.style.top = `${targetY}px`;
    elements.battlefield.append(smoke);
    state.animationTimers.push(window.setTimeout(() => smoke.remove(), 1300));
  }, 650));
}

function completeCannonShot(shotId) {
  if (state.gameOver || state.phase !== "cannon-firing" || state.lastCannonShot?.id !== shotId) return;
  if (state.roomId && state.activePlayer !== localPlayerId) return;
  state.lastCannonShot = null;
  prepareNextTurn();
  render();
  persistOnlineGameState().catch(error => console.error("Could not finish the cannon shot.", error));
}

function cpuFireCannon() {
  if (state.gameOver || state.phase !== "choose-cannon-target" || state.activePlayer !== "cpu") return;
  state.cpuTimer = null;
  const targets = state.players.filter(player => player.id !== "cpu");
  if (targets.length === 0) return;
  const target = targets[Math.floor(Math.random() * targets.length)];
  const index = Math.floor(Math.random() * target.tower.length);
  fireCannon(target.id, index, "cpu");
}

function animateVictory(winnerId) {
  const winnerPanel = elements.panels.find(panel => panel.dataset.player === winnerId);
  const winnerHunter = winnerPanel.querySelector(".summit-hunter");
  const boardRect = elements.battlefield.getBoundingClientRect();
  const winnerRect = winnerHunter.getBoundingClientRect();
  const targets = state.players
    .filter(player => player.id !== winnerId)
    .map(player => {
      const panel = elements.panels.find(candidate => candidate.dataset.player === player.id);
      const tower = panel.querySelector(".tower");
      const towerRect = tower.getBoundingClientRect();
      const arrow = document.createElement("div");
      arrow.className = "fire-arrow fire-arrow-generated";
      arrow.setAttribute("aria-hidden", "true");
      const startX = winnerRect.left + winnerRect.width / 2 - boardRect.left;
      const startY = winnerRect.top + winnerRect.height * .55 - boardRect.top;
      const targetX = towerRect.left + towerRect.width / 2 - boardRect.left;
      const targetY = towerRect.bottom - 16 - boardRect.top;
      elements.battlefield.append(arrow);
      arrow.style.left = `${startX}px`;
      arrow.style.top = `${startY}px`;
      arrow.style.setProperty("--flight-x", `${targetX - startX}px`);
      arrow.style.setProperty("--flight-y", `${targetY - startY}px`);
      arrow.style.setProperty("--flight-angle", `${Math.atan2(targetY - startY, targetX - startX)}rad`);
      return {
        arrow,
        panel,
        tower,
        hunter: panel.querySelector(".summit-hunter"),
        towerRect
      };
    });
  winnerHunter.classList.add("summit-archer-drawing");
  elements.battlefield.classList.add("battlefield-victory");
  for (const { arrow } of targets) {
    arrow.getBoundingClientRect();
  }

  const drawDuration = 2200;
  const arrowFlightDuration = 850;
  const impactAt = drawDuration + arrowFlightDuration;
  const collapseAt = impactAt + 300;
  state.animationTimers.push(window.setTimeout(() => {
    targets.forEach(({ arrow }) => arrow.classList.add("fire-arrow-flying"));
  }, drawDuration));

  state.animationTimers.push(window.setTimeout(() => {
    targets.forEach(({ arrow }) => arrow.classList.add("fire-arrow-exploded"));
    state.animationTimers.push(window.setTimeout(() => {
      targets.forEach(({ arrow }) => arrow.remove());
    }, 550));
  }, impactAt));

  state.animationTimers.push(window.setTimeout(() => {
    targets.forEach(({ panel, tower, hunter }) => {
      panel.classList.add("tower-under-attack");
      tower.classList.add("tower-collapsing");
      if (hunter) hunter.classList.add("hunter-suspended");
    });
  }, collapseAt));

  const fullCollapseDuration = 1100 + (BLOCKS_PER_TOWER - 1) * 80;
  const collapseCompleteAt = collapseAt + fullCollapseDuration;
  state.animationTimers.push(window.setTimeout(() => {
    targets.forEach(({ hunter }) => {
      if (hunter) {
        hunter.classList.remove("hunter-suspended");
        hunter.classList.add("hunter-falling");
      }
    });
  }, collapseCompleteAt));

  state.animationTimers.push(window.setTimeout(() => {
    targets.forEach(({ towerRect }) => {
      const smoke = document.createElement("div");
      smoke.className = "victory-smoke victory-smoke-rising victory-smoke-generated";
      smoke.setAttribute("aria-hidden", "true");
      smoke.style.left = `${towerRect.left + towerRect.width / 2 - boardRect.left}px`;
      smoke.style.top = `${towerRect.bottom - boardRect.top}px`;
      elements.battlefield.append(smoke);
      state.animationTimers.push(window.setTimeout(() => smoke.remove(), 1300));
    });
  }, collapseCompleteAt + 2000));

  state.animationTimers.push(window.setTimeout(() => {
    elements.result.textContent = state.victoryText;
    elements.result.hidden = false;
    elements.resultOverlay.hidden = false;
    elements.resultAction.hidden = !state.victoryAction;
    elements.resultAction.disabled = Boolean(currentRoom && !currentRoom.isHost);
    elements.resultExit.hidden = false;
  }, collapseCompleteAt + 2850));
}

function finishMove(player, index) {
  const currentPlayer = getPlayer(player);
  const tower = currentPlayer.tower;
  const placedNumber = state.incoming;
  const previousNumber = tower[index];
  tower[index] = placedNumber;
  state.lastMove = {
    playerId: player,
    number: placedNumber,
    replacedNumber: previousNumber,
    index
  };
  state.offered = previousNumber;
  state.incoming = null;
  state.lastCannonShot = null;

  if (isOrdered(tower)) {
    state.gameOver = true;
    state.phase = "finished";
    state.victoryText = `¡Ganador: ${currentPlayer.name}!`;
    state.victoryAction = null;
    if (state.mode === "bot" && player === "human") {
      const campaignComplete = state.levelIndex + 1 === LEVELS.length;
      state.victoryText = campaignComplete
        ? `¡Ganador: ${currentPlayer.name}! Has completado la campaña.`
        : `¡Ganador: ${currentPlayer.name}! Nivel ${state.levelIndex + 1} superado.`;
      if (!campaignComplete) {
        state.victoryAction = "next-level";
        elements.resultAction.textContent = `Continuar al nivel ${state.levelIndex + 2}`;
      }
    } else if (state.mode === "multiplayer" && state.levelIndex + 1 < LEVELS.length) {
      state.victoryText = `¡Ganador: ${currentPlayer.name}! Ronda ${state.levelIndex + 1} superada.`;
      state.victoryAction = "next-level";
      elements.resultAction.textContent = `Continuar al nivel ${state.levelIndex + 2}`;
    } else if (state.mode === "multiplayer") {
      state.victoryText = `¡Ganador: ${currentPlayer.name}! Has completado las siete rondas.`;
    } else if (state.mode === "bot") {
      state.victoryText = `¡Ganador: ${currentPlayer.name}! Has perdido la campaña.`;
    }
    elements.result.hidden = true;
    elements.resultOverlay.hidden = true;
    elements.resultAction.hidden = true;
    elements.resultExit.hidden = true;
    state.activePlayer = player;
    render();
    persistOnlineGameState().catch(error => console.error("Could not save the winning move.", error));
    state.animationTimers.push(window.setTimeout(() => animateVictory(player), 150));
    return;
  }

  const sequence = findConsecutiveSet(currentPlayer);
  if (sequence) {
    currentPlayer.cannonAvailable = true;
    currentPlayer.cannonSequence = sequence;
    currentPlayer.cannonProgress = [];
  }
  if (currentPlayer.cannonAvailable) {
    state.activePlayer = player;
    state.phase = "choose-cannon-target";
    render();
    persistOnlineGameState().catch(error => console.error("Could not save the earned cannon charge.", error));
    return;
  }

  prepareNextTurn();
  render();
  persistOnlineGameState().catch(error => console.error("Could not save the block exchange.", error));
}

function bestSwap(tower, number) {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < tower.length; index += 1) {
    const changed = [...tower];
    changed[index] = number;
    const score = inversionCount(changed);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return { index: bestIndex, score: bestScore };
}

function cpuMove() {
  if (state.gameOver || state.activePlayer !== "cpu") return;
  state.cpuTimer = null;
  const cpu = getPlayer("cpu");

  const choices = [];
  if (state.choiceNumber !== null) {
    choices.push({
      number: state.choiceNumber,
      source: "current",
      ...bestSwap(cpu.tower, state.choiceNumber)
    });
  }
  if (state.available.size > 0) {
    const availableNumbers = [...state.available];
    const candidateNumbers = state.difficulty === "hard"
      ? availableNumbers
      : [availableNumbers[Math.floor(Math.random() * availableNumbers.length)]];
    candidateNumbers.forEach(number => {
      choices.push({ number, source: "available", ...bestSwap(cpu.tower, number) });
    });
  }
  if (choices.length === 0) {
    prepareNextTurn();
    render();
    return;
  }

  const bestScore = Math.min(...choices.map(choice => choice.score));
  const bestChoices = choices.filter(choice => choice.score === bestScore);
  const choice = bestChoices[Math.floor(Math.random() * bestChoices.length)];
  if (choice.source === "available") {
    state.available.delete(choice.number);
  }
  state.offered = null;
  state.incoming = choice.number;
  state.choiceNumber = null;
  state.choiceSource = null;
  state.phase = "cpu-place";
  render();
  const targetBlock = elements.towers.cpu.querySelector(`[data-index="${choice.index}"]`);
  targetBlock?.classList.add("cpu-placement-target");
  state.cpuTimer = window.setTimeout(() => {
    state.cpuTimer = null;
    finishMove("cpu", choice.index);
  }, 650);
}

elements.visibleChoice.addEventListener("click", chooseCurrentNumber);
elements.randomChoice.addEventListener("click", () => {
  if (state.randomRevealed) passTurn();
  else revealRandomNumber();
});

elements.battlefield.addEventListener("click", event => {
  const block = event.target.closest(".block, .tower-reference-block");
  const panel = block?.closest(".player-panel");
  const playerId = panel?.dataset.player;
  if (!block || !playerId) return;
  const index = Number(block.dataset.index);
  if (state.phase === "choose-cannon-target") {
    fireCannon(playerId, index);
    return;
  }
  if (
    playerId === state.activePlayer
    && playerId === localPlayerId
    && playerId !== "cpu"
    && state.phase === "choose-block"
  ) finishMove(playerId, index);
});

document.querySelector("#open-play").addEventListener("click", () => showScreen("mode-menu"));
document.querySelector("#open-instructions").addEventListener("click", () => showScreen("instructions-screen"));
document.querySelectorAll(".menu-back").forEach(button => {
  button.addEventListener("click", () => showScreen(button.dataset.screen));
});
document.querySelector("#play-bot").addEventListener("click", () => {
  showScreen("bot-setup");
});
document.querySelector("#play-humans").addEventListener("click", () => {
  showOnlineError("");
  showScreen("online-menu");
});
elements.abandon.addEventListener("click", () => {
  if (currentRoom) {
    leaveOnlineRoom();
    return;
  }
  if (state.cpuTimer !== null) clearTimeout(state.cpuTimer);
  state.animationTimers.forEach(timer => clearTimeout(timer));
  state.cpuTimer = null;
  elements.battlefield.classList.remove("blind-mode", "blind-multiplayer", "four-player-game", "cpu-game", "battlefield-victory");
  showScreen("mode-menu");
});
document.querySelector("#start-bot-game").addEventListener("click", () => {
  campaign = {
    mode: "bot",
    levelIndex: 0,
    difficulty: elements.difficulty.value,
    playerName: elements.campaignName.value.trim() || "Jugador 1"
  };
  showCampaignLevel();
});
document.querySelector("#create-room").addEventListener("click", createOnlineRoom);
document.querySelector("#join-room").addEventListener("click", joinOnlineRoom);
document.querySelector("#start-room").addEventListener("click", startOnlineRoom);
document.querySelector("#leave-room").addEventListener("click", leaveOnlineRoom);
elements.roomLevel.addEventListener("change", updateRoomLevel);
elements.roomBlindTowers.addEventListener("change", updateRoomBlindMode);
elements.roomCodeInput.addEventListener("input", () => {
  elements.roomCodeInput.value = elements.roomCodeInput.value.replace(/\D/g, "").slice(0, 4);
});
document.querySelector("#campaign-level-continue").addEventListener("click", () => {
  newGame(campaign.mode, campaign.levelIndex, campaign.difficulty);
  showScreen("game-screen");
});
elements.beginRound.addEventListener("click", startRoundRoulette);
elements.resultAction.addEventListener("click", () => {
  if (state.victoryAction === "next-level") {
    if (currentRoom) {
      if (!currentRoom.isHost) return;
      currentRoom.level_index = state.levelIndex + 1;
      newGame("multiplayer", currentRoom.level_index, "medium", currentRoom.players);
      showScreen("game-screen");
      persistOnlineGameState().catch(error => console.error("Could not save the next round.", error));
      return;
    }
    campaign.levelIndex = state.levelIndex + 1;
    showCampaignLevel();
  }
});
elements.resultExit.addEventListener("click", () => {
  if (currentRoom) {
    leaveOnlineRoom();
    return;
  }
  document.body.classList.remove("game-multiplayer");
  elements.battlefield.classList.remove("blind-mode", "blind-multiplayer", "four-player-game", "cpu-game", "battlefield-victory");
  showScreen("main-menu");
});

function showCampaignLevel() {
  const maximum = levelMaximum(campaign.levelIndex, campaign.mode === "multiplayer" ? 3 : 2);
  elements.campaignLevelScreen.querySelector(".eyebrow").textContent =
    campaign.mode === "multiplayer" ? "Campaña multijugador" : "Campaña contra CPU";
  elements.campaignLevelTitle.textContent = `Nivel ${campaign.levelIndex + 1}`;
  elements.campaignLevelDescription.textContent =
    `Ordena la torre de mayor a menor con números del 1 al ${maximum}.`;
  showScreen("campaign-level-screen");
}

async function restoreRoomSession() {
  let savedSession;
  try {
    savedSession = JSON.parse(localStorage.getItem(ROOM_SESSION_KEY) || "null");
  } catch (error) {
    clearSavedRoomSession();
    console.error("Could not read the saved room session.", error);
    return;
  }
  if (!savedSession?.roomId || !savedSession?.playerId) return;
  try {
    await openRoom({
      room_id: savedSession.roomId,
      player_id: savedSession.playerId
    });
  } catch (error) {
    if (error.message.includes("no existe") || error.message.includes("No perteneces")) {
      clearSavedRoomSession();
      showOnlineError("La sala guardada ya no está disponible. Puedes crear o unirte a otra.");
      return;
    }
    setOnlineGameStatus(`No se pudo recuperar la sala guardada: ${error.message}`);
  }
}

restoreRoomSession();
