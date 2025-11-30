const videoUpload = document.getElementById('videoUpload');
const video = document.getElementById('sourceVideo');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loadingOverlay');
const controls = document.getElementById('controls');
const playPauseBtn = document.getElementById('playPauseBtn');
const recordBtn = document.getElementById('recordBtn');
const downloadBtn = document.getElementById('downloadBtn');

let isModelLoaded = false;
let isVideoReady = false;
let animationId;
let faces = []; // Stores detected faces and their mosaic state
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// Configuration
const MOSAIC_BLOCK_SIZE = 15; // Size of mosaic blocks

// Initialize
async function init() {
    loadingOverlay.classList.remove('hidden');
    try {
        // Load models from a reliable CDN
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);

        isModelLoaded = true;
        console.log('Models loaded');
        loadingOverlay.classList.add('hidden');
    } catch (error) {
        console.error('Error loading models:', error);
        alert('Failed to load AI models. Please check your internet connection.');
    }
}

init();

// Event Listeners
videoUpload.addEventListener('change', handleVideoUpload);
video.addEventListener('loadedmetadata', onVideoLoaded);
video.addEventListener('play', () => {
    playPauseBtn.textContent = 'Pause';
    loop();
});
video.addEventListener('pause', () => {
    playPauseBtn.textContent = 'Play';
    cancelAnimationFrame(animationId);
});
video.addEventListener('ended', () => {
    playPauseBtn.textContent = 'Play';
    cancelAnimationFrame(animationId);
    if (isRecording) stopRecording();
});

playPauseBtn.addEventListener('click', togglePlayPause);
recordBtn.addEventListener('click', toggleRecording);
canvas.addEventListener('mousedown', handleCanvasClick);

function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    video.src = url;
    downloadBtn.disabled = true;
    recordedChunks = [];
}

function onVideoLoaded() {
    isVideoReady = true;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw initial frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    controls.classList.remove('disabled');
}

function togglePlayPause() {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

// Main Processing Loop
async function loop() {
    if (video.paused || video.ended) return;

    // 1. Draw Video Frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Detect Faces
    // Using TinyFaceDetector for performance
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions());

    // 3. Update Face Tracking (Simple distance matching)
    updateFaces(detections);

    // 4. Draw Mosaics
    drawMosaics();

    animationId = requestAnimationFrame(loop);
}

function updateFaces(detections) {
    // Simple tracking: match new detections to old ones based on center distance
    const newFaces = detections.map(d => {
        const box = d.box;
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;

        // Find closest existing face
        let closest = null;
        let minDist = Infinity;

        for (const face of faces) {
            const faceCenterX = face.box.x + face.box.width / 2;
            const faceCenterY = face.box.y + face.box.height / 2;
            const dist = Math.hypot(centerX - faceCenterX, centerY - faceCenterY);

            if (dist < minDist) {
                minDist = dist;
                closest = face;
            }
        }

        // Threshold for being the "same" face (e.g., moved less than 100px)
        const MATCH_THRESHOLD = Math.max(box.width, box.height) * 1.5;

        let isMosaicOn = true; // Default to ON
        if (closest && minDist < MATCH_THRESHOLD) {
            isMosaicOn = closest.isMosaicOn;
        }

        return {
            box: box,
            isMosaicOn: isMosaicOn
        };
    });

    faces = newFaces;
}

// Offscreen canvas for mosaic generation
const mosaicCanvas = document.createElement('canvas');
const mosaicCtx = mosaicCanvas.getContext('2d');

function drawMosaics() {
    faces.forEach(face => {
        if (!face.isMosaicOn) return;

        const { x, y, width, height } = face.box;

        // Ensure offscreen canvas is big enough
        if (mosaicCanvas.width < width || mosaicCanvas.height < height) {
            mosaicCanvas.width = width;
            mosaicCanvas.height = height;
        }

        // 1. Draw face from video to offscreen canvas (tiny)
        const shrinkFactor = 0.1;
        const sw = Math.ceil(width * shrinkFactor);
        const sh = Math.ceil(height * shrinkFactor);

        mosaicCtx.imageSmoothingEnabled = true;
        mosaicCtx.drawImage(video, x, y, width, height, 0, 0, sw, sh);

        // 2. Draw back to offscreen canvas (large) with smoothing disabled
        mosaicCtx.imageSmoothingEnabled = false;
        mosaicCtx.drawImage(mosaicCanvas, 0, 0, sw, sh, 0, 0, width, height);

        // 3. Draw from offscreen canvas to main canvas with circular clip
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x + width / 2, y + height / 2, width / 2 * 0.8, height / 2 * 1.0, 0, 0, 2 * Math.PI);
        ctx.clip();

        ctx.drawImage(mosaicCanvas, 0, 0, width, height, x, y, width, height);

        ctx.restore();
    });
}

function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    // Calculate scale in case canvas is displayed smaller than actual size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Check if click is inside any face box
    let clickedFace = false;
    faces.forEach(face => {
        const { x, y, width, height } = face.box;
        if (clickX >= x && clickX <= x + width &&
            clickY >= y && clickY <= y + height) {

            face.isMosaicOn = !face.isMosaicOn;
            clickedFace = true;
        }
    });

    if (clickedFace && video.paused) {
        // Redraw immediately if paused so user sees feedback
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        drawMosaics();
    }
}

// Recording Logic
function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    const stream = canvas.captureStream(30); // 30 FPS

    const options = { mimeType: 'video/webm;codecs=vp9' };

    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
        // Fallback
        mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    isRecording = true;
    recordBtn.textContent = 'Stop Recording';
    recordBtn.classList.add('recording');

    // If video is paused, play it
    if (video.paused) {
        video.play();
    }
}

function stopRecording() {
    mediaRecorder.stop();
    isRecording = false;
    recordBtn.textContent = 'Start Recording';
    recordBtn.classList.remove('recording');
}

function handleDataAvailable(event) {
    if (event.data.size > 0) {
        recordedChunks.push(event.data);
    }
}

function handleStop() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);

    downloadBtn.href = url;
    downloadBtn.download = 'mosaic-video.webm';
    downloadBtn.disabled = false;

    downloadBtn.onclick = () => {
        setTimeout(() => URL.revokeObjectURL(url), 100);
    };
}
