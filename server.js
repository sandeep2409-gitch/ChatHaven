const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory State
const users = {}; // socket.id -> { id, username, color, status }
const groups = ['#general-lounge', '#tech-talks', '#memes-hq'];
const roomHistory = {};

// Initialize history for default groups
groups.forEach(group => {
    roomHistory[group] = [];
});

function getFormattedTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
}

function generateId() {
    return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

// Broadcast active user list to all online clients
function broadcastUserList() {
    const activeUsersList = Object.values(users).map(u => ({
        id: u.id,
        username: u.username,
        color: u.color
    }));
    io.emit('online_users_list', {
        users: activeUsersList,
        groups: groups
    });
}

io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    // Action: User logs in/registers session
    socket.on('register_user', ({ username, color }) => {
        const safeUsername = String(username || 'User').trim().substring(0, 25);
        const safeColor = String(color || '#00f2fe').trim();

        users[socket.id] = {
            id: socket.id,
            username: safeUsername,
            color: safeColor
        };

        console.log(`[Socket] User Registered: ${safeUsername} (${socket.id})`);

        // Automatically join default groups
        groups.forEach(group => {
            socket.join(group);
        });

        // Broadcast updated directory
        broadcastUserList();
    });

    // Action: User requests chat history for room (Group or DM)
    socket.on('get_room_history', ({ room }) => {
        let historyRoom = room;

        // If it's a DM, make sure both sockets are joined in that room
        if (!room.startsWith('#')) {
            // Room is formatted as: socketId1-socketId2
            const ids = room.split('-');
            if (ids.includes(socket.id)) {
                // Join current socket
                socket.join(room);
                
                // Retrieve target peer ID
                const peerId = ids.find(id => id !== socket.id);
                if (peerId) {
                    const peerSocket = io.sockets.sockets.get(peerId);
                    if (peerSocket) {
                        peerSocket.join(room); // auto-join peer
                    }
                }
            }
        }

        if (!roomHistory[historyRoom]) {
            roomHistory[historyRoom] = [];
        }

        // Return history to requestor
        socket.emit('room_history', {
            room: room,
            history: roomHistory[historyRoom]
        });
    });

    // Action: Chat Message Sent
    socket.on('chat_message', ({ text, room }) => {
        const user = users[socket.id];
        if (!user) return;

        const safeText = String(text || '').trim().substring(0, 1000);
        if (!safeText) return;

        const chatMsg = {
            id: generateId(),
            sender: user.username,
            senderId: socket.id,
            color: user.color,
            text: safeText,
            time: getFormattedTime(),
            room: room // Group name or DM pair ID
        };

        if (!roomHistory[room]) {
            roomHistory[room] = [];
        }

        // Append to history (cap at 50)
        const history = roomHistory[room];
        history.push(chatMsg);
        if (history.length > 50) {
            history.shift();
        }
        roomHistory[room] = history;

        // Broadcast message to everyone in the room
        io.to(room).emit('chat_message', chatMsg);
    });

    // Action: User typing state sync
    socket.on('typing', ({ room }) => {
        const user = users[socket.id];
        if (!user) return;

        socket.to(room).emit('user_typing', {
            username: user.username,
            id: socket.id,
            room: room
        });
    });

    // Action: User stopped typing state sync
    socket.on('stop_typing', ({ room }) => {
        socket.to(room).emit('user_stop_typing', {
            id: socket.id,
            room: room
        });
    });

    // Action: Create dynamic group
    socket.on('create_group', ({ groupName }) => {
        const cleanName = '#' + String(groupName || '').trim().toLowerCase().replace(/[^a-z0-9\-]/g, '');
        if (cleanName === '#' || groups.includes(cleanName)) return;

        groups.push(cleanName);
        roomHistory[cleanName] = [];
        
        console.log(`[Socket] Group created: ${cleanName}`);
        
        // Notify all online clients about new group listing
        broadcastUserList();
    });

    // Action: Disconnected
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            console.log(`[Socket] User Disconnected: ${user.username}`);
            
            // Clean up typing
            io.emit('user_stop_typing', { id: socket.id });

            delete users[socket.id];
            broadcastUserList();
        }
    });
});

server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🟢 WhatsApp Server running on port ${PORT}`);
    console.log(`🔗 Local Address: http://localhost:${PORT}`);
    console.log(`===================================================`);
});
