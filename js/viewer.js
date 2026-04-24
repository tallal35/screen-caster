const roomCodeInput = document.getElementById('roomCodeInput');
const joinBtn = document.getElementById('joinBtn');
const statusText = document.getElementById('statusText');
const viewerUI = document.getElementById('viewerUI');
const videoContainer = document.getElementById('videoContainer');
const remoteVideo = document.getElementById('remoteVideo');
const disconnectBtn = document.getElementById('disconnectBtn');

let peer;
let currentCall;
let dataConn;

function initPeer() {
    // Initialize Viewer Peer
    peer = new Peer({
        debug: 2
    });

    peer.on('open', (id) => {
        statusText.textContent = 'Ready to connect.';
        statusText.style.color = '#94a3b8';
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        statusText.textContent = `Error: ${err.message}`;
        statusText.style.color = '#ef4444';
        
        // Reset UI if it fails
        resetUI();
    });
}

function joinRoom() {
    const code = roomCodeInput.value.trim();
    if (!code) {
        statusText.textContent = 'Please enter a room code.';
        statusText.style.color = '#ef4444';
        return;
    }

    statusText.textContent = 'Connecting...';
    statusText.style.color = '#3b82f6';
    
    const hostId = `screencaster-${code}`;
    
    // Connect data channel for remote control
    dataConn = peer.connect(hostId);
    
    // We initiate the call to the host. We don't send our own stream.
    const call = peer.call(hostId, getEmptyStream());
    
    currentCall = call;

    call.on('stream', (remoteStream) => {
        // Stream received!
        remoteVideo.srcObject = remoteStream;
        
        // Show video, hide UI
        viewerUI.style.display = 'none';
        videoContainer.style.display = 'flex';
        
        // Enter fullscreen if on mobile for best experience (requires user gesture)
        tryFullscreen();
    });

    call.on('close', () => {
        statusText.textContent = 'Host disconnected.';
        statusText.style.color = '#ef4444';
        resetUI();
    });
    
    call.on('error', (err) => {
        statusText.textContent = 'Failed to connect. Check room code.';
        statusText.style.color = '#ef4444';
        resetUI();
    });
}

// PeerJS requires a stream to initiate a call, so we provide a fake empty stream
function getEmptyStream() {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    
    // Create a dummy video track (a black canvas)
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const canvasStream = canvas.captureStream(0); // 0 fps
    
    // Combine empty audio and video
    const emptyStream = new MediaStream([
        ...dest.stream.getTracks(),
        ...canvasStream.getTracks()
    ]);
    
    return emptyStream;
}

function resetUI() {
    if (currentCall) {
        currentCall.close();
        currentCall = null;
    }
    remoteVideo.srcObject = null;
    viewerUI.style.display = 'block';
    videoContainer.style.display = 'none';
    
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err));
    }
}

function tryFullscreen() {
    if (videoContainer.requestFullscreen) {
        videoContainer.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    }
}

joinBtn.addEventListener('click', joinRoom);

// Allow pressing Enter to join
roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

disconnectBtn.addEventListener('click', resetUI);

// Initialize
initPeer();

// --- Remote Control Logic ---

function getRelativeCoords(clientX, clientY) {
    const rect = remoteVideo.getBoundingClientRect();
    const vw = remoteVideo.videoWidth;
    const vh = remoteVideo.videoHeight;
    
    if (!vw || !vh) return { x: 0.5, y: 0.5 };
    
    const rectRatio = rect.width / rect.height;
    const videoRatio = vw / vh;
    
    let actualWidth, actualHeight, offsetX, offsetY;
    
    if (rectRatio > videoRatio) {
        actualHeight = rect.height;
        actualWidth = actualHeight * videoRatio;
        offsetX = (rect.width - actualWidth) / 2;
        offsetY = 0;
    } else {
        actualWidth = rect.width;
        actualHeight = actualWidth / videoRatio;
        offsetX = 0;
        offsetY = (rect.height - actualHeight) / 2;
    }
    
    const x = (clientX - rect.left - offsetX) / actualWidth;
    const y = (clientY - rect.top - offsetY) / actualHeight;
    
    return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y))
    };
}

function sendControl(type, coords = null) {
    if (dataConn && dataConn.open) {
        const payload = { type: type };
        if (coords) {
            payload.x = coords.x;
            payload.y = coords.y;
        }
        dataConn.send(payload);
    }
}

// Mobile Touch Events
videoContainer.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
        const coords = getRelativeCoords(e.touches[0].clientX, e.touches[0].clientY);
        sendControl('move', coords);
    }
}, { passive: true });

videoContainer.addEventListener('touchend', (e) => {
    // For simplicity, a tap without dragging acts as a click
    // A robust app might measure time between start and end to differentiate
    sendControl('click');
});

// PC Mouse Events (for testing)
videoContainer.addEventListener('mousemove', (e) => {
    const coords = getRelativeCoords(e.clientX, e.clientY);
    sendControl('move', coords);
});

videoContainer.addEventListener('click', (e) => {
    sendControl('click');
});

// Basic Keyboard
window.addEventListener('keydown', (e) => {
    if (dataConn && dataConn.open) {
        sendControl('keydown', { x: 0, y: 0, key: e.key });
    }
});
