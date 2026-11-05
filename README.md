# NEON RIFT — Battle Royale (2–20 players)

A small, real-time multiplayer browser-game starter using Node.js and WebSocket.

## Features
- The lobby host selects a match capacity from **2 to 20 players**.
- The selected capacity is enforced by the server; later players cannot exceed it.
- Real browser clients connect to the same WebSocket server.
- Mobile touch controls and keyboard controls.
- Basic authoritative server simulation: movement, shooting, health, shrinking safe zone, elimination and winner announcement.

## Run locally
Requires Node.js 18 or newer.

```bash
npm install
npm start
```
Open `http://localhost:3000` in a browser. For a real multiplayer test, use two devices on the same reachable server.

## Deploy to Render
1. Upload the contents of this folder to a GitHub repository, preserving `public/index.html`.
2. Create a Render **Web Service** connected to that repository.
3. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
4. Open the HTTPS address Render provides. The browser client automatically uses secure WebSocket (`wss://`) on HTTPS.

## Important limitations
This is a playable prototype, not a production-ready commercial game. The 20-player cap is implemented in the lobby/server logic, but actual performance depends on hosting resources and needs load testing with real devices. Before public commercial release, add account/authentication, matchmaking and isolated rooms, reconnect handling, anti-cheat/rate limits, persistent statistics, monitoring, moderation, and load tests. A free host may sleep when idle, causing a delay on the first connection.
