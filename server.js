const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const GameState = require('./game-state.js'); 

const app = express();
app.set('trust proxy', 1);
app.use(cors());

app.use(session({
    secret: 'dtcg-hardcore-degen-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: true, // 因为 Render 是强制 HTTPS 的，这里直接写死 true
        sameSite: 'lax', // 🔥 2. 允许跨域跳转（从 Discord 跳回来）时携带 Cookie
        maxAge: 1000 * 60 * 60 * 24 * 7 // 保持登录 7 天
    }
}));

app.use('/img', express.static(path.join(__dirname, 'img')));
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" }, 
    pingTimeout: 60000 
});

// 🔥 使用环境变量读取密钥（安全！）
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/discord/callback';

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    console.error("❌ 缺少 Discord 环境变量！请在 .env 文件或部署平台设置 DISCORD_CLIENT_ID 和 DISCORD_CLIENT_SECRET");
    console.error("   否则 Discord 登录将无法使用！");
}

// Discord OAuth2 管线
app.get('/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(url);
});

// 🔥 3. 给前端查询登录状态的接口
app.get('/auth/status', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/'); 
    try {
        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID, 
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code', 
            code: code, 
            redirect_uri: DISCORD_REDIRECT_URI
        });
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', params.toString(), { 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' } 
        });
        const userResponse = await axios.get('https://discord.com/api/users/@me', { 
            headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } 
        });
        
        req.session.user = {
            id: userResponse.data.id, 
            username: userResponse.data.username,
            global_name: userResponse.data.global_name, 
            avatar: userResponse.data.avatar
        };
        res.redirect('/'); 
    } catch (err) { 
        console.error(err);
        res.redirect('/'); 
    }
});

app.get('/api/me', (req, res) => {
    if (req.session.user) res.json(req.session.user);
    else res.status(401).json({ error: '未登录' });
});

// ==========================================
// ⚔️ 赛博大厅与对战引擎 (备战室升维版)
// ==========================================
let rooms = {};

// 提取房间状态用于前端备战室渲染
const getRoomState = (room) => {
    return {
        hostId: room.hostId, 
        p1: room.players.p1 ? { id: room.players.p1.id, name: room.players.p1.name, avatar: room.players.p1.avatar, ready: room.players.p1.ready } : null,
        p2: room.players.p2 ? { id: room.players.p2.id, name: room.players.p2.name, avatar: room.players.p2.avatar, ready: room.players.p2.ready } : null,
        spectators: room.spectators.map(s => ({ id: s.id, name: s.name })), 
        isStarted: room.game !== null
    };
};

io.on('connection', (socket) => {
    const broadcastLobbyState = () => {
        const availableRooms = Object.keys(rooms)
            .filter(roomId => rooms[roomId].players.p2 === null && rooms[roomId].players.p1 !== null) 
            .map(roomId => ({ roomId, hostName: rooms[roomId].players.p1.name }));
        io.emit('lobbyUpdate', availableRooms);
    };
    broadcastLobbyState();

    // 1. 创建房间 (挂载 hostId)
    socket.on('createRoom', ({ playerName, deck, avatar }) => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            hostId: socket.id,
            players: { p1: { id: socket.id, name: playerName, deck: deck, avatar: avatar, ready: false }, p2: null },
            spectators: [], 
            game: null
        };
        socket.join(roomId);
        socket.emit('roomJoined', { roomId, role: 'p1', state: getRoomState(rooms[roomId]) });
        broadcastLobbyState();
    });

    // 2. 加入房间
    socket.on('joinRoom', ({ roomId, playerName, customDeck, avatar }) => {
        const room = rooms[roomId];
        if (!room) return socket.emit('lobbyError', 'ROOM INVALID (房间不存在)');

        if (!room.players.p2) {
            room.players.p2 = { id: socket.id, name: playerName, deck: customDeck, avatar: avatar, ready: false };
            socket.join(roomId);
            socket.emit('roomJoined', { roomId, role: 'p2', state: getRoomState(room) });
            broadcastLobbyState(); 
        } else {
            room.spectators.push({ id: socket.id, name: playerName, deck: customDeck, avatar: avatar });
            socket.join(roomId);
            socket.emit('roomJoined', { roomId, role: 'spectator', state: getRoomState(room) });
            if (room.game) socket.emit('gameStart', { p1Id: room.players.p1.id, p2Id: room.players.p2.id, roomId, state: room.game });
        }
        io.to(roomId).emit('stagingUpdate', getRoomState(room));
    });

    // 3. 自由换座
    socket.on('switchRole', ({ roomId, toRole }) => {
        const room = rooms[roomId];
        if(!room || room.game) return;

        let pData = null;
        let currentRole = null;

        if (room.players.p1 && room.players.p1.id === socket.id) { 
            currentRole = 'p1'; pData = room.players.p1; room.players.p1 = null; 
        }
        else if (room.players.p2 && room.players.p2.id === socket.id) { 
            currentRole = 'p2'; pData = room.players.p2; room.players.p2 = null; 
        }
        else {
            const specIdx = room.spectators.findIndex(s => s.id === socket.id);
            if (specIdx !== -1) { 
                currentRole = 'spectator'; pData = room.spectators[specIdx]; room.spectators.splice(specIdx, 1); 
            }
        }

        if (!pData) return;

        if (toRole === 'p1' || toRole === 'p2') {
            if (room.players[toRole] !== null) return;
            room.players[toRole] = { ...pData, ready: false };
        } else if (toRole === 'spectator') {
            room.spectators.push({ ...pData });
        }

        io.to(roomId).emit('roleSwitched', { socketId: socket.id, newRole: toRole });
        io.to(roomId).emit('stagingUpdate', getRoomState(room));
        broadcastLobbyState();
    });
    

    // 4. 退出房间
    socket.on('leaveRoom', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (socket.id === room.hostId) {
            io.to(roomId).emit('roomClosed', 'HOST CLOSED THE ROOM (房主已解散房间).');
            delete rooms[roomId];
            broadcastLobbyState();
        } else {
            if (room.players.p1 && room.players.p1.id === socket.id) room.players.p1 = null;
            else if (room.players.p2 && room.players.p2.id === socket.id) room.players.p2 = null;
            else room.spectators = room.spectators.filter(s => s.id !== socket.id);

            socket.leave(roomId);
            io.to(roomId).emit('stagingUpdate', getRoomState(room));
            broadcastLobbyState();
        }
    });

    // 5. 换牌指令
    socket.on('updatePlayerDeck', ({ roomId, role, deck }) => {
        const room = rooms[roomId];
        if (!room || room.game) return;

        if (room.players[role] && room.players[role].id === socket.id) {
            room.players[role].deck = deck;
            room.players[role].ready = false; 
            io.to(roomId).emit('stagingUpdate', getRoomState(room));
            console.log(`>> [ROOM ${roomId}] ${role} 更换了卡组`);
        }
    });

    // 6. 准备按钮
    socket.on('toggleReady', ({ roomId, role }) => {
        const room = rooms[roomId];
        if (!room || !room.players[role] || room.game) return;
        
        room.players[role].ready = !room.players[role].ready;
        io.to(roomId).emit('stagingUpdate', getRoomState(room));

        if (room.players.p1.ready && room.players.p2 && room.players.p2.ready) {
            room.game = new GameState(room.players.p1.name, room.players.p2.name, room.players.p1.deck, room.players.p2.deck); 
            io.to(roomId).emit('gameStart', {
                p1Id: room.players.p1.id, 
                p2Id: room.players.p2.id, 
                roomId: roomId, 
                state: room.game
            });
        }
    });

    // 7. 聊天
    socket.on('sendChat', ({ roomId, sender, message }) => {
        io.to(roomId).emit('chatMessage', { sender, message });
    });

    socket.on('disconnect', () => {
        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (!room.game && room.players.p1 && room.players.p1.id === socket.id) {
                delete rooms[roomId];
                broadcastLobbyState();
            }
        }
    });

    // 8. 指令分发中心
    socket.on('action', (data) => {
        const room = rooms[data.roomId];
        if (!room || !room.game || room.game.gameOver) return;
        const game = room.game;
        const { type, playerId, card, zone, targetInstanceId, actionType, blastData, attackerInstanceId, targetType, effectId, blockerInstanceId, handCard, targetId1, targetId2, selectedCardInstanceId, choice } = data;

        switch (type) {
            case 'mulligan': game.decideMulligan(playerId, data.doMulligan); break;
            case 'hatch': game.hatchEgg(playerId); break;
            case 'play': game.playOrEvolve(playerId, card, zone, targetInstanceId); break;
            case 'moveBreeding': game.moveBreedingToBattle(playerId); break;
            case 'pass': game.passTurn(); break;
            case 'declareAttack': game.declareAttack(playerId, attackerInstanceId, targetType, targetInstanceId); break;
            case 'resolveCounter': game.resolveCounter(playerId, actionType, blastData); break;
            case 'performBlock': game.performBlock(playerId, blockerInstanceId); break;
            case 'skipBlock': game.skipBlock(playerId); break;
            case 'resolveEffect': game.resolveEffect(effectId); break;
            case 'dnaDigivolve': game.dnaEvolve(playerId, handCard, targetId1, targetId2); break;
            case 'attachToStack': game.attachToStack(playerId, data.sourceInstanceId, data.targetInstanceId); break;
            case 'submitTarget': game.submitTarget(playerId, targetInstanceId); break;
            case 'submitRevealChoice': game.submitRevealChoice(playerId, selectedCardInstanceId); break;
            case 'submitTrashRevive': game.submitTrashRevive(playerId, selectedCardInstanceId); break;
            case 'submitProtectionChoice': game.submitProtectionChoice(playerId, choice); break;
            case 'resolveManualEffect': game.resolveManualEffect(playerId, data.effectIndex, data.confirmed); break;
        }
        io.to(data.roomId).emit('gameStateUpdate', game);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { 
    console.log(`🚀 DTCG Pro v36.5 Online on Port ${PORT}`); 
});
