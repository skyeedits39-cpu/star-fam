document.addEventListener('DOMContentLoaded', () => {
    // 1. Automatic Login / Auth Check on Page Load
    const currentUser = localStorage.getItem('starFamUser') || sessionStorage.getItem('starFamUser');
    
    // Look for common authentication container selectors used in your app
    const authOverlay = document.getElementById('auth-overlay') || 
                        document.querySelector('.auth-container') || 
                        document.getElementById('loginModal') ||
                        document.querySelector('.auth-screen');

    if (!currentUser) {
        // If no user session exists, force the login/signup screen to display
        if (authOverlay) {
            authOverlay.classList.remove('hidden');
            authOverlay.style.display = 'flex';
        }
    }

    // 2. Socket.io Connection Setup
    // Automatically connects to the host hosting the app (works for both localhost and Railway)
    const socket = io();

    // 3. App Elements & State Handlers
    const chatMessages = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    // Handle sending messages if elements exist on the page
    if (sendButton && messageInput && chatMessages) {
        sendButton.addEventListener('click', () => {
            const text = messageInput.value.trim();
            if (text) {
                socket.emit('chatMessage', { text, user: currentUser || 'Guest' });
                messageInput.value = '';
            }
        });

        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendButton.click();
            }
        });

        // Listen for incoming live chat messages from the server
        socket.on('chatMessage', (data) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            messageDiv.innerHTML = `<strong>${data.user}:</strong> ${data.text}`;
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    console.log("✨ Star Fam client initialized successfully.");
});