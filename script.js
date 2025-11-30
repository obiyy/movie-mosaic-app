const imageUpload = document.getElementById('imageUpload');
const canvasContainer = document.getElementById('canvasContainer');
const saveBtn = document.getElementById('saveBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const placeholderText = document.querySelector('.placeholder-text');

let image;
let canvas;
let detections = [];
let mosaicStates = []; // Array of booleans, true = apply mosaic
let isModelsLoaded = false;

// Load models from a CDN that supports CORS
// Using a specific version to ensure compatibility
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

async function loadModels() {
    loadingIndicator.classList.remove('hidden');
    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            // faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL) // Heavier but more accurate
        ]);
        isModelsLoaded = true;
        console.log('Models loaded successfully');
    } catch (error) {
        console.error('Error loading models:', error);
        alert('Failed to load AI models. Please check your internet connection or CORS settings.');
    } finally {
        loadingIndicator.classList.add('hidden');
    }
}

// Initialize
loadModels();

imageUpload.addEventListener('change', async () => {
    if (!isModelsLoaded) {
        alert('Models are still loading, please wait...');
        return;
    }

    const file = imageUpload.files[0];
    if (!file) return;

    // Show loading
    loadingIndicator.classList.remove('hidden');

    // Create image from file
    const img = await faceapi.bufferToImage(file);
    image = img;

    // Clear previous canvas
    canvasContainer.innerHTML = '';
    canvasContainer.appendChild(image); // Temporarily add image to get dimensions if needed, or just use it for detection

    // Create canvas
    canvas = faceapi.createCanvasFromMedia(image);
    canvasContainer.innerHTML = ''; // Clear again
    canvasContainer.appendChild(canvas);

    // Resize canvas to match display size (responsive)
    // For simplicity in this version, we'll keep intrinsic size but scale with CSS
    // To handle clicks correctly, we need to map display coordinates to canvas coordinates
    // But for now, let's just use the full resolution canvas

    const displaySize = { width: image.width, height: image.height };
    faceapi.matchDimensions(canvas, displaySize);

    // Detect faces
    // Using TinyFaceDetector for speed
    detections = await faceapi.detectAllFaces(image, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    // Initialize mosaic states (all ON by default)
    mosaicStates = new Array(resizedDetections.length).fill(true);

    // Draw
    draw(resizedDetections);

    // Enable save button
    saveBtn.disabled = false;
    placeholderText.style.display = 'none';

    loadingIndicator.classList.add('hidden');

    // Add click event listener to canvas
    canvas.addEventListener('click', (e) => handleCanvasClick(e, resizedDetections));
});

function draw(resizedDetections) {
    const ctx = canvas.getContext('2d');

    // Draw original image
    ctx.drawImage(image, 0, 0);

    // Draw mosaics
    resizedDetections.forEach((detection, index) => {
        if (mosaicStates[index]) {
            const { x, y, width, height } = detection.detection.box;
            applyMosaic(ctx, x, y, width, height, 15); // 15 is block size
        } else {
            // Optional: Draw a box to show where the face was detected when mosaic is OFF
            // const { x, y, width, height } = detection.detection.box;
            // ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
            // ctx.lineWidth = 2;
            // ctx.strokeRect(x, y, width, height);
        }
    });
}

function applyMosaic(ctx, x, y, width, height, blockSize) {
    // Adjust dimensions to be integers
    x = Math.floor(x);
    y = Math.floor(y);
    width = Math.floor(width);
    height = Math.floor(height);

    for (let i = x; i < x + width; i += blockSize) {
        for (let j = y; j < y + height; j += blockSize) {
            // Get average color of the block
            // To improve performance, we could just sample the center pixel
            // But getting average is better quality

            // Safe bounds check
            const w = Math.min(blockSize, x + width - i);
            const h = Math.min(blockSize, y + height - j);

            // Get pixel data for this block
            // Note: getImageData can be slow if called many times. 
            // Optimization: Get data for the whole face area once.

            // Simple center sampling for performance
            const pixelData = ctx.getImageData(i + w / 2, j + h / 2, 1, 1).data;

            ctx.fillStyle = `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`;
            ctx.fillRect(i, j, w, h);
        }
    }
}

function handleCanvasClick(event, resizedDetections) {
    const rect = canvas.getBoundingClientRect();

    // Calculate scale factors in case canvas is displayed at different size than intrinsic
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    // Check if click is inside any face box
    let clicked = false;
    resizedDetections.forEach((detection, index) => {
        const box = detection.detection.box;
        if (x >= box.x && x <= box.x + box.width &&
            y >= box.y && y <= box.y + box.height) {

            // Toggle state
            mosaicStates[index] = !mosaicStates[index];
            clicked = true;
        }
    });

    if (clicked) {
        draw(resizedDetections);
    }
}

saveBtn.addEventListener('click', () => {
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'mosaic-image.png';
    link.href = canvas.toDataURL();
    link.click();
});
