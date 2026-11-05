'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = Number(process.env.PORT || 3000);
const MAX_CAPACITY = 20;
const MAP = { width: 2400, height: 1800 };
const clients = new Map();
let players = new Map();
let bullets = [];
let capacity = 20;
let hostId = null;
let gameState = 'lobby'; // lobby | playing | finished
let safeRadius = 850;
let tick = 0;
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const file = path.join(__dirname, 'public', pathname.replace(/^\/+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(data);
  });
});
const wss = new WebSocket.Server({ server });
const rand = (n) => Math.floor(Math.random() * n);
function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function broadcast(obj) { const data = JSON.stringify(obj); for (const ws of clients.values()) if (ws.readyState === WebSocket.OPEN) ws.send(data); }
function snapshot() {
  return { type:'state', gameState, capacity, count:players.size, map:MAP, safeRadius,
    players:[...players.values()].map(p => ({ id:p.id, name:p.name, x:p.x, y:p.y, hp:p.hp, alive:p.alive, color:p.color, score:p.score })),
    bullets: bullets.map(b => ({x:b.x,y:b.y})) };
}
function resetMatch() {
  bullets = []; safeRadius = 850; gameState = 'playing'; tick = 0;
  let i = 0;
  for (const p of players.values()) {
    const angle = (Math.PI * 2 * i++) / Math.max(1, players.size);
    p.x = MAP.width/2 + Math.cos(angle)*550; p.y = MAP.height/2 + Math.sin(angle)*400;
    p.hp = 100; p.alive = true; p.score = 0; p.lastShot = 0;
  }
  broadcast({type:'notice', text:'مسابقه شروع شد! آخرین بازمانده برنده است.'});
}
function endIfNeeded() {
  if (gameState !== 'playing') return;
  const alive = [...players.values()].filter(p => p.alive);
  if (alive.length <= 1) {
    gameState = 'finished';
    broadcast({type:'winner', winner: alive[0]?.name || 'بدون برنده'});
  }
}
wss.on('connection', ws => {
  let playerId = null;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'join' && !playerId) {
      if (gameState === 'playing') return send(ws, {type:'error', text:'مسابقه در حال اجراست؛ برای مسابقه بعدی صبر کن.'});
      const requested = Math.max(2, Math.min(MAX_CAPACITY, Number(msg.capacity) || 20));
      if (players.size === 0) { capacity = requested; hostId = null; gameState = 'lobby'; }
      if (players.size >= capacity) return send(ws, {type:'error', text:'ظرفیت این مسابقه تکمیل است.'});
      playerId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
      if (!hostId) hostId = playerId;
      const p = { id:playerId, name:String(msg.name || 'بازیکن').slice(0,16), x:MAP.width/2+rand(300)-150, y:MAP.height/2+rand(300)-150, hp:100, alive:true, color:`hsl(${rand(360)} 90% 62%)`, score:0, lastShot:0, input:{dx:0,dy:0,aimX:1,aimY:0,fire:false} };
      players.set(playerId,p); clients.set(playerId,ws);
      send(ws,{type:'joined',id:playerId,host:playerId===hostId,capacity});
      broadcast({type:'notice',text:`${p.name} وارد مسابقه شد (${players.size}/${capacity})`});
      broadcast(snapshot());
      return;
    }
    if (!playerId || !players.has(playerId)) return;
    const p = players.get(playerId);
    if (msg.type === 'start') {
      if (playerId !== hostId) return send(ws,{type:'error',text:'فقط میزبان می‌تواند مسابقه را شروع کند.'});
      if (players.size < 2) return send(ws,{type:'error',text:'برای شروع حداقل ۲ بازیکن لازم است.'});
      resetMatch(); broadcast(snapshot()); return;
    }
    if (msg.type === 'input' && gameState === 'playing' && p.alive) {
      const clamp = (v) => Math.max(-1,Math.min(1,Number(v)||0));
      p.input = {dx:clamp(msg.dx),dy:clamp(msg.dy),aimX:clamp(msg.aimX),aimY:clamp(msg.aimY),fire:!!msg.fire};
    }
    if (msg.type === 'restart' && gameState === 'finished' && playerId === hostId) {
      for (const q of players.values()) { q.hp=100; q.alive=true; q.score=0; }
      resetMatch(); broadcast(snapshot());
    }
  });
  ws.on('close', () => {
    if (!playerId) return;
    const p = players.get(playerId); if (p) broadcast({type:'notice',text:`${p.name} خارج شد.`});
    players.delete(playerId); clients.delete(playerId);
    if (hostId === playerId) hostId = players.keys().next().value || null;
    if (players.size === 0) { gameState='lobby'; bullets=[]; capacity=20; hostId=null; }
    else if (gameState === 'playing') endIfNeeded();
    broadcast(snapshot());
  });
});
setInterval(() => {
  if (gameState !== 'playing') return;
  tick++;
  for (const p of players.values()) {
    if (!p.alive) continue;
    const speed = 4.2; p.x = Math.max(25,Math.min(MAP.width-25,p.x+p.input.dx*speed)); p.y = Math.max(25,Math.min(MAP.height-25,p.y+p.input.dy*speed));
    const cx=MAP.width/2, cy=MAP.height/2;
    if (Math.hypot(p.x-cx,p.y-cy) > safeRadius) { if (tick%10===0) p.hp -= 3; }
    if (p.input.fire && tick-p.lastShot>9) {
      const mag=Math.hypot(p.input.aimX,p.input.aimY)||1;
      bullets.push({x:p.x,y:p.y,vx:p.input.aimX/mag*12,vy:p.input.aimY/mag*12,owner:p.id,life:90}); p.lastShot=tick;
    }
    if (p.hp<=0) p.alive=false;
  }
  bullets = bullets.filter(b => {
    b.x+=b.vx; b.y+=b.vy; b.life--;
    if (b.life<=0 || b.x<0 || b.y<0 || b.x>MAP.width || b.y>MAP.height) return false;
    for (const p of players.values()) {
      if (!p.alive || p.id===b.owner) continue;
      if (Math.hypot(p.x-b.x,p.y-b.y)<24) { p.hp-=25; if (p.hp<=0) { p.alive=false; const shooter=players.get(b.owner); if(shooter) shooter.score++; } return false; }
    }
    return true;
  });
  if (tick%300===0) safeRadius=Math.max(180,safeRadius-85);
  if (tick%3===0) broadcast(snapshot());
  endIfNeeded();
}, 1000/30);
server.listen(PORT,'0.0.0.0',()=>console.log(`NEON RIFT server listening on ${PORT}`));
