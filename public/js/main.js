/**
 * ChatHaven WhatsApp client logic
 * Day 23 of 30 Days Challenge
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State Variables ---
    let socket = null;
    let username = '';
    let userColor = '';
    let userId = '';
    
    let activeChatId = ''; // Starts empty. Displays Welcome panel.
    let isWindowFocused = true;
    
    // In-memory cache structures
    let onlineUsers = [];   // [{ id, username, color }]
    let groupChannels = []; // ['#general-lounge', ...]
    let chatsData = {};     // chatId -> { type, name, color, lastText, lastTime, peerId }
    let unreadCounts = {};  // chatId -> count
    let messageHistoryCache = {}; // chatId -> [messages]
    let typingRegistry = {}; // roomId -> { id -> username }
    
    let isTyping = false;
    let typingTimer = null;

    // --- DOM Elements ---
    const joinOverlay = document.getElementById('join-overlay');
    const joinForm = document.getElementById('join-form');
    const usernameInput = document.getElementById('username');
    const avatarPreview = document.getElementById('avatar-preview');

    const appContainer = document.getElementById('app-container');
    const appSidebar = document.getElementById('app-sidebar');
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    const userAvatarDisplay = document.getElementById('user-avatar-display');
    const userNameDisplay = document.getElementById('user-name-display');
    const btnLogout = document.getElementById('btn-logout');

    const sidebarSearchInput = document.getElementById('sidebar-search-input');
    const btnClearSidebarSearch = document.getElementById('btn-clear-sidebar-search');
    const chatsListContainer = document.getElementById('chats-list-container');

    const welcomePanel = document.getElementById('welcome-panel');
    const chatWorkspace = document.getElementById('chat-workspace');
    
    const activeAvatarDisplay = document.getElementById('active-avatar-display');
    const activeChatTitle = document.getElementById('active-chat-title');
    const activeChatSubtitle = document.getElementById('active-chat-subtitle');

    const chatSearch = document.getElementById('chat-search');
    const btnClearSearch = document.getElementById('btn-clear-search');
    const messageFeed = document.getElementById('message-feed');
    const btnScrollBottom = document.getElementById('btn-scroll-bottom');

    const typingIndicatorBox = document.getElementById('typing-indicator-box');
    const btnEmojiToggle = document.getElementById('btn-emoji-toggle');
    const messageInput = document.getElementById('message-input');
    const btnSendMessage = document.getElementById('btn-send-message');
    const emojiTrayPanel = document.getElementById('emoji-tray-panel');

    const btnAddRoom = document.getElementById('btn-add-room');
    const addRoomModal = document.getElementById('add-room-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const btnConfirmRoom = document.getElementById('btn-confirm-room');
    const newRoomNameInput = document.getElementById('new-room-name');

    // --- Dynamic Avatar & Color Helpers ---
    function generateColorHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 50%)`;
    }

    function getInitials(name) {
        const clean = name.trim().replace(/[^a-zA-Z0-9\s]/g, '');
        if (!clean) return '?';
        const parts = clean.split(/\s+/);
        if (parts.length > 1) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return clean.substring(0, 2).toUpperCase();
    }

    // Dynamic preview on register screen
    usernameInput.addEventListener('input', () => {
        const val = usernameInput.value.trim();
        if (val) {
            const initials = getInitials(val);
            const color = generateColorHash(val);
            avatarPreview.textContent = initials;
            avatarPreview.style.backgroundColor = color;
        } else {
            avatarPreview.textContent = '?';
            avatarPreview.style.backgroundColor = 'rgba(255,255,255,0.05)';
        }
    });

    // --- Tab Focus and Document Title ---
    window.addEventListener('focus', () => {
        isWindowFocused = true;
        if (activeChatId) {
            unreadCounts[activeChatId] = 0;
            renderChatsSidebar();
            updatePageTitle();
        }
    });

    window.addEventListener('blur', () => {
        isWindowFocused = false;
    });

    function updatePageTitle() {
        let count = 0;
        Object.keys(unreadCounts).forEach(id => {
            count += (unreadCounts[id] || 0);
        });

        if (count > 0) {
            document.title = `(${count}) New Messages // ChatHaven`;
        } else {
            document.title = 'ChatHaven // WhatsApp Web Node';
        }
    }

    // --- Synthetic Sound Alerts (Web Audio API) ---
    function playNotificationSound(isIncoming = true) {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sine';
            const now = ctx.currentTime;
            
            if (isIncoming) {
                // Incoming high bell pitch double-beep
                osc.frequency.setValueAtTime(659.25, now); // E5
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                
                osc.frequency.setValueAtTime(880.00, now + 0.1); // A5
                gain.gain.setValueAtTime(0.001, now + 0.1);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.12);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
            } else {
                // Outgoing message keypress click
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(329.63, now); // E4
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.04, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
            }
            
            osc.start(now);
            osc.stop(now + 0.4);
        } catch (e) {}
    }

    // --- Socket Initializer ---
    function initializeSocket() {
        socket = io();

        socket.on('connect', () => {
            userId = socket.id;
            console.log(`[Socket] Connected as socket ID: ${userId}`);
            
            socket.emit('register_user', {
                username: username,
                color: userColor
            });
        });

        // Event: Synchronized directory update from backend
        socket.on('online_users_list', ({ users, groups }) => {
            onlineUsers = users;
            groupChannels = groups;
            
            synchronizeChatsDataCache();
            renderChatsSidebar();
        });

        // Event: Chat message payload received
        socket.on('chat_message', (msg) => {
            const roomId = msg.room;

            // Cache history locally
            if (!messageHistoryCache[roomId]) {
                messageHistoryCache[roomId] = [];
            }
            messageHistoryCache[roomId].push(msg);

            // Update chat info previews
            if (chatsData[roomId]) {
                const prefix = msg.senderId === socket.id ? 'You: ' : `${msg.sender}: `;
                chatsData[roomId].lastText = prefix + msg.text;
                chatsData[roomId].lastTime = msg.time;
                chatsData[roomId].lastTimestamp = Date.now(); // for sorting
            }

            // Route UI changes
            if (roomId === activeChatId) {
                appendChatMessage(msg, true);
                if (msg.senderId !== socket.id) {
                    if (!isWindowFocused) {
                        unreadCounts[roomId] = (unreadCounts[roomId] || 0) + 1;
                        playNotificationSound(true);
                    } else {
                        // Play outgoing subtle tone
                        playNotificationSound(false);
                    }
                }
            } else {
                // Background room message, increment badge
                unreadCounts[roomId] = (unreadCounts[roomId] || 0) + 1;
                playNotificationSound(true);
            }

            renderChatsSidebar();
            updatePageTitle();
        });

        // Event: Downloaded scrollback history
        socket.on('room_history', ({ room, history }) => {
            if (room !== activeChatId) return;

            messageHistoryCache[room] = history;
            messageFeed.innerHTML = '';

            history.forEach(msg => {
                appendChatMessage(msg, false);
            });

            scrollToBottom();
            runSearchFilter(); // filter if user is searching
        });

        // Event: User typing notifications
        socket.on('user_typing', (data) => {
            const room = data.room;
            if (!typingRegistry[room]) {
                typingRegistry[room] = {};
            }
            typingRegistry[room][data.id] = data.username;
            
            if (room === activeChatId) {
                renderTypingIndicator();
            }
        });

        // Event: User typing clear
        socket.on('user_stop_typing', (data) => {
            const room = data.room;
            if (typingRegistry[room]) {
                delete typingRegistry[room][data.id];
            }
            
            if (room === activeChatId) {
                renderTypingIndicator();
            }
        });

        socket.on('disconnect', () => {
            console.warn('[Socket] Disconnected.');
        });
    }

    // Combine Groups and Users lists into a single sorted Sidebar structure
    function synchronizeChatsDataCache() {
        const nextChatsData = {};

        // 1. Synchronize Groups
        groupChannels.forEach(groupName => {
            const oldData = chatsData[groupName] || {};
            nextChatsData[groupName] = {
                id: groupName,
                type: 'group',
                name: groupName.replace('#', ''),
                color: '#128c7e', // Group default green
                lastText: oldData.lastText || 'No messages yet',
                lastTime: oldData.lastTime || '',
                lastTimestamp: oldData.lastTimestamp || 0
            };
        });

        // 2. Synchronize Online Contacts (Exclude current user)
        onlineUsers.forEach(peer => {
            if (peer.id === socket.id) return;

            // DM Room ID is alphabetical sort
            const dmRoomId = [socket.id, peer.id].sort().join('-');
            const oldData = chatsData[dmRoomId] || {};

            nextChatsData[dmRoomId] = {
                id: dmRoomId,
                type: 'dm',
                name: peer.username,
                color: peer.color,
                lastText: oldData.lastText || 'Start direct messaging',
                lastTime: oldData.lastTime || '',
                lastTimestamp: oldData.lastTimestamp || 0,
                peerId: peer.id
            };
        });

        // Retain unreads for active chats
        chatsData = nextChatsData;
    }

    // --- Sidebar Chat list rendering ---
    function renderChatsSidebar() {
        chatsListContainer.innerHTML = '';

        // Sort chats by last message recency (most recent at the top)
        const sortedChats = Object.values(chatsData).sort((a, b) => b.lastTimestamp - a.lastTimestamp);
        const searchQuery = sidebarSearchInput.value.trim().toLowerCase();

        sortedChats.forEach(chat => {
            // Apply search filters
            if (searchQuery && !chat.name.toLowerCase().includes(searchQuery)) {
                return;
            }

            const isActive = chat.id === activeChatId;
            const unreads = unreadCounts[chat.id] || 0;
            const initials = getInitials(chat.name);

            const li = document.createElement('li');
            li.className = `chat-item ${isActive ? 'active' : ''}`;
            li.setAttribute('data-chat-id', chat.id);

            // Escape strings
            const safeName = escapeHTML(chat.name);
            const safeMsg = escapeHTML(chat.lastText);

            li.innerHTML = `
                <div class="chat-avatar" style="background-color: ${chat.color}">
                    ${chat.type === 'group' ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-svg-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>' : initials}
                </div>
                <div class="chat-details">
                    <div class="chat-row-1">
                        <span class="chat-title">${safeName}</span>
                        <span class="chat-meta-time">${chat.lastTime}</span>
                    </div>
                    <div class="chat-row-2">
                        <span class="chat-last-msg">${safeMsg}</span>
                        ${unreads > 0 && !isActive ? `<span class="unread-badge">${unreads}</span>` : ''}
                    </div>
                </div>
            `;

            li.addEventListener('click', () => {
                selectConversation(chat.id);
            });

            chatsListContainer.appendChild(li);
        });
    }

    // Handle switching between conversation threads
    function selectConversation(chatId) {
        if (chatId === activeChatId) return;

        // Clear local typing flags on switch
        clearTypingTimer();

        activeChatId = chatId;
        const chat = chatsData[activeChatId];
        if (!chat) return;

        // Swap Panels visibility
        welcomePanel.classList.add('hidden');
        chatWorkspace.classList.remove('hidden');

        // Setup Header Metadata details
        activeChatTitle.textContent = chat.name;
        if (chat.type === 'group') {
            activeAvatarDisplay.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-svg-icon"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
        } else {
            activeAvatarDisplay.innerHTML = escapeHTML(getInitials(chat.name));
        }
        activeAvatarDisplay.style.backgroundColor = chat.color;
        activeChatSubtitle.textContent = chat.type === 'group' ? 'Group conversation' : 'Online contact';

        // Clear Search text area
        chatSearch.value = '';
        btnClearSearch.classList.add('hidden');

        // Reset unread counters
        unreadCounts[chatId] = 0;
        updatePageTitle();
        renderChatsSidebar();

        // Download room history from server
        socket.emit('get_room_history', { room: activeChatId });

        // Close sidebar on mobile
        appSidebar.classList.remove('open');
        messageInput.focus();

        // Update typing indicator display
        renderTypingIndicator();
    }

    // --- Message send/composer actions ---
    function transmitMessage() {
        const text = messageInput.value.trim();
        if (!text || !activeChatId || !socket) return;

        // Emit message payload
        socket.emit('chat_message', {
            text: text,
            room: activeChatId
        });

        // Reset input sizing
        messageInput.value = '';
        messageInput.style.height = 'auto';

        // Clear typing
        clearTypingTimer();
        
        // Play local click beep
        playNotificationSound(false);

        messageInput.focus();
    }

    btnSendMessage.addEventListener('click', transmitMessage);

    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = `${messageInput.scrollHeight}px`;

        triggerTypingPulse();
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            transmitMessage();
        }
    });

    // --- Typing pulse timer ---
    function triggerTypingPulse() {
        if (!socket || !activeChatId) return;

        if (!isTyping) {
            isTyping = true;
            socket.emit('typing', { room: activeChatId });
        }

        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            isTyping = false;
            socket.emit('stop_typing', { room: activeChatId });
        }, 1500);
    }

    function clearTypingTimer() {
        if (isTyping && socket && activeChatId) {
            isTyping = false;
            socket.emit('stop_typing', { room: activeChatId });
        }
        clearTimeout(typingTimer);
    }

    function renderTypingIndicator() {
        const registry = typingRegistry[activeChatId] || {};
        const typists = Object.values(registry);

        if (typists.length === 0) {
            typingIndicatorBox.innerHTML = '';
            return;
        }

        let indicatorText = '';
        if (typists.length === 1) {
            indicatorText = `${typists[0]} is typing`;
        } else {
            indicatorText = 'Several people are typing';
        }

        typingIndicatorBox.innerHTML = `
            ${indicatorText}
            <div class="typing-dots">
                <span></span><span></span><span></span>
            </div>
        `;
    }

    // --- Message Append Renderer ---
    function appendChatMessage(msg, animateScroll = true) {
        const isSelf = msg.senderId === socket.id;
        const msgWrapper = document.createElement('div');
        msgWrapper.className = `msg-wrapper ${isSelf ? 'self' : ''}`;
        msgWrapper.setAttribute('data-msg-id', msg.id);

        const safeText = escapeHTML(msg.text);
        const nameLabel = !isSelf && chatsData[msg.room]?.type === 'group' 
            ? `<span class="msg-sender-label" style="color: ${msg.color}">${msg.sender}</span>` 
            : '';

        // WhatsApp sent ticks (✓✓ blue ticks for self messages)
        const ticks = isSelf ? `
            <span class="msg-ticks">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </span>
        ` : '';

        msgWrapper.innerHTML = `
            <div class="msg-bubble">
                ${nameLabel}
                <span>${safeText}</span>
                <div class="msg-bubble-meta">
                    <span class="msg-bubble-time">${msg.time}</span>
                    ${ticks}
                </div>
            </div>
        `;

        messageFeed.appendChild(msgWrapper);

        if (animateScroll) {
            scrollToBottomSmoothIfClose();
        }
    }

    function appendSystemMessage(msg) {
        const sysWrapper = document.createElement('div');
        sysWrapper.className = 'msg-system';
        sysWrapper.innerHTML = `<span>${escapeHTML(msg.text)}</span>`;
        messageFeed.appendChild(sysWrapper);
        scrollToBottomSmoothIfClose();
    }

    // HTML Escape
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- Scroll management ---
    function isNearBottom() {
        const threshold = 150;
        const total = messageFeed.scrollHeight;
        const visible = messageFeed.clientHeight;
        const current = messageFeed.scrollTop;
        return (total - visible - current) <= threshold;
    }

    function scrollToBottom() {
        messageFeed.scrollTop = messageFeed.scrollHeight;
    }

    function scrollToBottomSmoothIfClose() {
        if (isNearBottom()) {
            messageFeed.scrollTo({
                top: messageFeed.scrollHeight,
                behavior: 'smooth'
            });
        } else {
            btnScrollBottom.classList.remove('hidden');
        }
    }

    messageFeed.addEventListener('scroll', () => {
        if (isNearBottom()) {
            btnScrollBottom.classList.add('hidden');
        }
    });

    btnScrollBottom.addEventListener('click', () => {
        messageFeed.scrollTo({
            top: messageFeed.scrollHeight,
            behavior: 'smooth'
        });
        btnScrollBottom.classList.add('hidden');
    });

    // --- Filter Search inputs ---
    chatSearch.addEventListener('input', runSearchFilter);
    btnClearSearch.addEventListener('click', () => {
        chatSearch.value = '';
        btnClearSearch.classList.add('hidden');
        runSearchFilter();
    });

    function runSearchFilter() {
        const query = chatSearch.value.trim().toLowerCase();
        
        if (query) {
            btnClearSearch.classList.remove('hidden');
        } else {
            btnClearSearch.classList.add('hidden');
        }

        const wrappers = messageFeed.querySelectorAll('.msg-wrapper');
        const activeHistory = messageHistoryCache[activeChatId] || [];

        wrappers.forEach(wrap => {
            const msgId = wrap.getAttribute('data-msg-id');
            const msgObj = activeHistory.find(m => m.id === msgId);
            if (!msgObj) return;

            const text = msgObj.text;
            const textBubbleSpan = wrap.querySelector('.msg-bubble > span');

            if (text.toLowerCase().includes(query)) {
                wrap.style.display = 'flex';
                if (query) {
                    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
                    textBubbleSpan.innerHTML = escapeHTML(text).replace(regex, '<span class="message-highlight">$1</span>');
                } else {
                    textBubbleSpan.innerHTML = escapeHTML(text);
                }
            } else {
                wrap.style.display = 'none';
            }
        });
    }

    // Sidebar search filtering
    sidebarSearchInput.addEventListener('input', () => {
        if (sidebarSearchInput.value.trim()) {
            btnClearSidebarSearch.classList.remove('hidden');
        } else {
            btnClearSidebarSearch.classList.add('hidden');
        }
        renderChatsSidebar();
    });

    btnClearSidebarSearch.addEventListener('click', () => {
        sidebarSearchInput.value = '';
        btnClearSidebarSearch.classList.add('hidden');
        renderChatsSidebar();
    });

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // --- Login form submissions ---
    joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nameVal = usernameInput.value.trim();
        if (!nameVal) return;

        username = nameVal;
        userColor = generateColorHash(username);

        // Hide overlay, open workspace
        joinOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');

        // Render profile Details
        userNameDisplay.textContent = username;
        userAvatarDisplay.textContent = getInitials(username);
        userAvatarDisplay.style.backgroundColor = userColor;

        // Initialize connection
        initializeSocket();
    });

    // --- Emoji Drawer panel ---
    btnEmojiToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiTrayPanel.classList.toggle('hidden');
    });

    emojiTrayPanel.addEventListener('click', (e) => {
        if (e.target.tagName === 'SPAN') {
            const emoji = e.target.textContent;
            
            const start = messageInput.selectionStart;
            const end = messageInput.selectionEnd;
            const val = messageInput.value;
            
            messageInput.value = val.substring(0, start) + emoji + val.substring(end);
            messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
            
            messageInput.style.height = 'auto';
            messageInput.style.height = `${messageInput.scrollHeight}px`;
            messageInput.focus();
            
            emojiTrayPanel.classList.add('hidden');
            triggerTypingPulse();
        }
    });

    document.addEventListener('click', (e) => {
        if (!emojiTrayPanel.contains(e.target) && e.target !== btnEmojiToggle) {
            emojiTrayPanel.classList.add('hidden');
        }
    });

    // --- Sidebar toggles on responsive sizes ---
    btnSidebarToggle.addEventListener('click', () => {
        appSidebar.classList.toggle('open');
    });

    messageFeed.addEventListener('click', () => {
        appSidebar.classList.remove('open');
    });

    btnLogout.addEventListener('click', () => {
        if (confirm("Are you sure you want to disconnect this chat session?")) {
            location.reload();
        }
    });

    // --- Dynamic group creation ---
    btnAddRoom.addEventListener('click', () => {
        addRoomModal.classList.remove('hidden');
        newRoomNameInput.value = '';
        newRoomNameInput.focus();
    });

    function closeModal() {
        addRoomModal.classList.add('hidden');
    }

    btnCloseModal.addEventListener('click', closeModal);
    btnCancelModal.addEventListener('click', closeModal);

    btnConfirmRoom.addEventListener('click', createCustomGroup);

    newRoomNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            createCustomGroup();
        }
    });

    function createCustomGroup() {
        const rawName = newRoomNameInput.value.trim().toLowerCase();
        const cleanName = rawName.replace(/[^a-z0-9\-]/g, '');

        if (!cleanName) {
            alert('Please enter a valid group subject (letters, numbers, hyphens only).');
            return;
        }

        const groupHash = `#${cleanName}`;
        
        if (socket) {
            socket.emit('create_group', { groupName: cleanName });
            closeModal();
            // Automatically switch chats to the new group
            setTimeout(() => {
                selectConversation(groupHash);
            }, 300);
        }
    }
});
