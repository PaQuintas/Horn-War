const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const LEVEL_COUNT = 7;
const rooms = new Map();
const roomSockets = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function roomView(room) {
  return {
    id: room.id,
    code: room.code,
    host_id: room.host_id,
    status: room.status,
    level_index: room.level_index,
    blind_mode: room.blind_mode,
    game_state: room.game_state,
    players: room.players.map(player => ({ ...player }))
  };
}

function requirePlayer(room, playerId) {
  if (!playerId || !room.players.some(player => player.user_id === playerId)) {
    throw new HttpError(403, "No perteneces a esta sala.");
  }
}

function requireHost(room, playerId) {
  requirePlayer(room, playerId);
  if (room.host_id !== playerId) throw new HttpError(403, "Solo el anfitrión puede hacer esto.");
}

function publish(room) {
  const sockets = roomSockets.get(room.id);
  if (!sockets) return;
  const message = JSON.stringify({ type: "room-updated" });
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}

function createPlayer(name, seatIndex) {
  const playerName = typeof name === "string" ? name.trim() : "";
  if (playerName.length < 1 || playerName.length > 16) {
    throw new HttpError(400, "El nombre debe tener entre 1 y 16 caracteres.");
  }
  return {
    user_id: crypto.randomBytes(24).toString("hex"),
    player_name: playerName,
    seat_index: seatIndex
  };
}

function makeRoomCode() {
  let code;
  do {
    code = String(crypto.randomInt(0, 10000)).padStart(4, "0");
  } while ([...rooms.values()].some(room => room.code === code));
  return code;
}

function parseLevel(value) {
  const levelIndex = Number(value);
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= LEVEL_COUNT) {
    throw new HttpError(400, "El nivel seleccionado no es válido.");
  }
  return levelIndex;
}

function findRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) throw new HttpError(404, "La sala ya no existe o el servidor se ha reiniciado.");
  return room;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) throw new HttpError(413, "La petición es demasiado grande.");
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "La petición contiene JSON no válido.");
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

function createRoom(player, levelIndex, blindMode) {
  const id = crypto.randomUUID();
  const room = {
    id,
    code: makeRoomCode(),
    host_id: player.user_id,
    status: "waiting",
    level_index: levelIndex,
    blind_mode: Boolean(blindMode),
    game_state: null,
    players: [player]
  };
  rooms.set(id, room);
  return room;
}

async function handleApi(request, response, url) {
  const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const method = request.method;
  const body = method === "GET" ? {} : await readJson(request);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", storage: "memory" });
    return;
  }

  if (method === "POST" && url.pathname === "/api/rooms") {
    const player = createPlayer(body.playerName, 0);
    const room = createRoom(player, parseLevel(body.levelIndex), body.blindMode);
    sendJson(response, 201, {
      room_id: room.id,
      room_code: room.code,
      seat_index: 0,
      player_id: player.user_id
    });
    return;
  }

  if (method === "POST" && url.pathname === "/api/rooms/join") {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{4}$/.test(code)) throw new HttpError(400, "Introduce un código válido de cuatro cifras.");
    const room = [...rooms.values()].find(candidate => candidate.code === code);
    if (!room || room.status !== "waiting") {
      throw new HttpError(404, "No se encontró una sala abierta con ese código.");
    }
    if (room.players.length >= 4) throw new HttpError(409, "La sala ya está completa.");
    const player = createPlayer(body.playerName, room.players.length);
    room.players.push(player);
    publish(room);
    sendJson(response, 201, {
      room_id: room.id,
      room_code: room.code,
      seat_index: player.seat_index,
      player_id: player.user_id
    });
    return;
  }

  if (segments[0] !== "api" || segments[1] !== "rooms" || !segments[2]) {
    throw new HttpError(404, "Ruta no encontrada.");
  }

  const room = findRoom(segments[2]);
  const playerId = body.playerId || url.searchParams.get("playerId");

  if (method === "GET" && segments.length === 3) {
    requirePlayer(room, playerId);
    sendJson(response, 200, { room: roomView(room) });
    return;
  }

  if (method === "PATCH" && segments[3] === "level") {
    requireHost(room, playerId);
    if (room.status !== "waiting") throw new HttpError(409, "La partida ya ha comenzado.");
    room.level_index = parseLevel(body.levelIndex);
    publish(room);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "PATCH" && segments[3] === "blind-mode") {
    requireHost(room, playerId);
    if (room.status !== "waiting") throw new HttpError(409, "La partida ya ha comenzado.");
    room.blind_mode = Boolean(body.blindMode);
    publish(room);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && segments[3] === "start") {
    requireHost(room, playerId);
    if (room.status !== "waiting") throw new HttpError(409, "La partida ya ha comenzado.");
    if (room.players.length < 2) throw new HttpError(409, "Se necesitan al menos dos jugadores.");
    room.status = "in_progress";
    publish(room);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "PUT" && segments[3] === "state") {
    requirePlayer(room, playerId);
    if (room.status !== "in_progress") throw new HttpError(409, "La sala todavía no ha empezado.");
    const expectedRevision = Number(body.expectedRevision);
    const currentRevision = room.game_state?.revision ?? -1;
    const nextState = body.gameState;
    if (expectedRevision !== currentRevision) {
      throw new HttpError(409, "La partida está desactualizada; sincronizando el estado actual.");
    }
    if (!nextState || typeof nextState !== "object" || nextState.revision !== expectedRevision + 1) {
      throw new HttpError(400, "El estado de partida no es válido.");
    }
    room.game_state = nextState;
    publish(room);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "POST" && segments[3] === "leave") {
    requirePlayer(room, playerId);
    room.players = room.players.filter(player => player.user_id !== playerId);
    for (const socket of roomSockets.get(room.id) || []) {
      if (socket.playerId === playerId) socket.close(1000, "Player left");
    }
    if (room.players.length === 0) {
      rooms.delete(room.id);
      for (const socket of roomSockets.get(room.id) || []) socket.close(1000, "Room closed");
      roomSockets.delete(room.id);
    } else {
      room.players.forEach((player, index) => {
        player.seat_index = index;
      });
      if (room.host_id === playerId) room.host_id = room.players[0].user_id;
    }
    if (room.players.length > 0) publish(room);
    sendJson(response, 200, { ok: true });
    return;
  }

  throw new HttpError(404, "Ruta no encontrada.");
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function serveStatic(request, response, url) {
  if (!["GET", "HEAD"].includes(request.method)) {
    sendJson(response, 405, { error: "Método no permitido." });
    return;
  }
  let requestPath;
  try {
    requestPath = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, { error: "Ruta no válida." });
    return;
  }
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  if (!["index.html", "game.js", "styles.css"].includes(relativePath)) {
    sendJson(response, 404, { error: "Archivo no encontrado." });
    return;
  }
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    sendJson(response, 403, { error: "Acceso denegado." });
    return;
  }
  try {
    const content = await fs.promises.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      sendJson(response, 404, { error: "Archivo no encontrado." });
      return;
    }
    throw error;
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const work = url.pathname.startsWith("/api/")
    ? handleApi(request, response, url)
    : serveStatic(request, response, url);
  work.catch(error => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    sendJson(response, error.status || 500, {
      error: error.status ? error.message : "Error interno del servidor."
    });
    if (!error.status) console.error("Request failed:", error);
  });
});

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/events$/);
  if (!match) {
    socket.destroy();
    return;
  }
  const roomId = decodeURIComponent(match[1]);
  const room = rooms.get(roomId);
  const playerId = url.searchParams.get("playerId");
  if (!room || !room.players.some(player => player.user_id === playerId)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, webSocket => {
    const sockets = roomSockets.get(roomId) || new Set();
    webSocket.playerId = playerId;
    sockets.add(webSocket);
    roomSockets.set(roomId, sockets);
    webSocket.on("close", () => {
      sockets.delete(webSocket);
      if (sockets.size === 0) roomSockets.delete(roomId);
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Horn War listening on port ${PORT}`);
});
