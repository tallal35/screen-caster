const roomCodeElement = document.getElementById('roomCode');
const statusText = document.getElementById('statusText');
const startShareBtn = document.getElementById('startShareBtn');
const videoOverlay = document.getElementById('videoOverlay');
const screenPreview = document.getElementById('screenPreview');

let peer;
let roomCode;
let localStream;

// Generate a random 6-digit code
function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function initPeer() {
    roomCode = generateRoomCode();
    const peerId = `screencaster-${roomCode}`;
    
    // Initialize PeerJS
    peer = new Peer(peerId, {
        debug: 2
    });

    peer.on('open', (id) => {
        roomCodeElement.textContent = roomCode;
        statusText.textContent = 'Ready. Waiting for you to start sharing...';
    });

    peer.on('call', (call) => {
        if (!localStream) {
            console.log("Call received but no stream to share yet.");
            // We could answer without a stream, or wait. Better to let user know.
            return;
        }
        
        statusText.textContent = 'Viewer connecting...';
        
        // Answer the call with our screen stream
        call.answer(localStream);
        
        call.on('stream', (remoteStream) => {
            // Host doesn't need the viewer's stream
        });

        call.on('close', () => {
            statusText.textContent = 'Viewer disconnected.';
        });
        
        statusText.textContent = 'Viewer connected and viewing!';
    });

    // Listen for data connection for remote control
    peer.on('connection', (conn) => {
        conn.on('data', async (data) => {
            try {
                // Forward the control command to our local PowerShell API
                await fetch('http://localhost:8080/api/control', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
            } catch (err) {
                console.error("Failed to execute remote command:", err);
            }
        });
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
            // ID taken, try again
            initPeer();
        } else {
            statusText.textContent = `Error: ${err.message}`;
        }
    });
}

async function startSharing() {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                displaySurface: "monitor",
                width: { ideal: 3840, max: 3840 },
                height: { ideal: 2160, max: 2160 },
                frameRate: { ideal: 60, max: 120 }
            },
            audio: true
        });

        // Optimize track for high detail to prioritize the 4K resolution
        const videoTrack = localStream.getVideoTracks()[0];
        if ("contentHint" in videoTrack) {
            videoTrack.contentHint = "detail";
        }

        screenPreview.srcObject = localStream;
        videoOverlay.style.display = 'none';
        statusText.textContent = 'Screen shared! Waiting for viewers to join...';

        // Listen for user stopping the share via browser UI
        localStream.getVideoTracks()[0].onended = () => {
            stopSharing();
        };

    } catch (err) {
        console.error("Error sharing screen: ", err);
        alert("Could not start screen sharing. " + err.message);
    }
}

function stopSharing() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    screenPreview.srcObject = null;
    videoOverlay.style.display = 'flex';
    statusText.textContent = 'Sharing stopped.';
}

startShareBtn.addEventListener('click', startSharing);

// Initialize
initPeer();
