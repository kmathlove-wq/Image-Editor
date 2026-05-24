// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadContainer = document.getElementById('upload-container');
const editorSection = document.getElementById('editor-section');
const imageCanvas = document.getElementById('image-canvas');
const maskCanvas = document.getElementById('mask-canvas');
const brushSizeInput = document.getElementById('brush-size');
const brushSizeValue = document.getElementById('brush-size-value');
const undoBtn = document.getElementById('undo-btn');
const clearBtn = document.getElementById('clear-btn');
const resetBtn = document.getElementById('reset-btn');
const eraseBtn = document.getElementById('erase-btn');
const downloadBtn = document.getElementById('download-btn');
const loader = document.getElementById('editor-loader');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');

// Contexts
const imgCtx = imageCanvas.getContext('2d');
const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

// State
let originalImage = null;
let isDrawing = false;
let brushSize = 30;
let drawHistory = [];
let session = null;
let processedImageUrl = null;

// Model URL
const MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';

// Initialize
async function init() {
    brushSizeInput.addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        brushSizeValue.innerText = `${brushSize}px`;
    });

    // Canvas Events
    maskCanvas.addEventListener('mousedown', startDrawing);
    maskCanvas.addEventListener('mousemove', draw);
    maskCanvas.addEventListener('mouseup', stopDrawing);
    maskCanvas.addEventListener('mouseout', stopDrawing);

    // Touch Events
    maskCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        maskCanvas.dispatchEvent(mouseEvent);
    });
    maskCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        maskCanvas.dispatchEvent(mouseEvent);
    });
    maskCanvas.addEventListener('touchend', () => {
        maskCanvas.dispatchEvent(new MouseEvent('mouseup'));
    });

    // Button Events
    undoBtn.addEventListener('click', undo);
    clearBtn.addEventListener('click', clearMask);
    resetBtn.addEventListener('click', resetUI);
    eraseBtn.addEventListener('click', runInpainting);

    // Upload Events
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    });
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processFile(file);
    });
}

// File Processing
async function processFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일을 선택해 주세요.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        originalImage = new Image();
        originalImage.onload = () => {
            setupCanvas();
            uploadContainer.classList.add('hidden');
            editorSection.classList.remove('hidden');
        };
        originalImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setupCanvas() {
    const maxWidth = 800;
    const maxHeight = 600;
    let width = originalImage.width;
    let height = originalImage.height;

    if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
    }
    if (height > maxHeight) {
        width = (maxHeight / height) * width;
        height = maxHeight;
    }

    imageCanvas.width = maskCanvas.width = width;
    imageCanvas.height = maskCanvas.height = height;

    imgCtx.drawImage(originalImage, 0, 0, width, height);
    clearMask();
}

// Drawing Logic
function startDrawing(e) {
    isDrawing = true;
    saveHistory();
    draw(e);
}

function draw(e) {
    if (!isDrawing) return;

    const rect = maskCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    maskCtx.lineWidth = brushSize;
    maskCtx.lineCap = 'round';
    maskCtx.strokeStyle = 'rgba(255, 0, 0, 1)'; // Solid red for internal mask, though UI has opacity
    
    maskCtx.lineTo(x, y);
    maskCtx.stroke();
    maskCtx.beginPath();
    maskCtx.moveTo(x, y);
}

function stopDrawing() {
    isDrawing = false;
    maskCtx.beginPath();
}

function clearMask() {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    drawHistory = [];
}

function saveHistory() {
    drawHistory.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
    if (drawHistory.length > 20) drawHistory.shift();
}

function undo() {
    if (drawHistory.length > 0) {
        maskCtx.putImageData(drawHistory.pop(), 0, 0);
    }
}

// AI Engine
async function loadModel() {
    if (session) return session;
    
    try {
        statusText.innerText = 'AI 모델을 불러오는 중 (약 200MB)...';
        progressBar.style.width = '30%';
        
        // Use WebGL or WASM. WebGPU is better if available.
        const options = {
            executionProviders: ['webgl', 'wasm'],
            graphOptimizationLevel: 'all'
        };
        
        session = await ort.InferenceSession.create(MODEL_URL, options);
        progressBar.style.width = '100%';
        return session;
    } catch (error) {
        console.error('Model loading failed:', error);
        throw new Error('AI 모델을 불러오지 못했습니다.');
    }
}

async function runInpainting() {
    try {
        loader.classList.remove('hidden');
        statusText.innerText = 'AI 엔진 준비 중...';
        progressBar.style.width = '10%';

        const model = await loadModel();
        statusText.innerText = '이미지 분석 및 처리 중...';
        progressBar.style.width = '50%';

        // 1. Prepare Inputs (Image and Mask)
        // LaMa expects 3xHxW image and 1xHxW mask, usually 512x512
        const size = 512;
        const inputImg = preprocessImage(imageCanvas, size);
        const inputMask = preprocessMask(maskCanvas, size);

        // 2. Run Inference
        const feeds = {
            image: inputImg,
            mask: inputMask
        };

        const results = await model.run(feeds);
        const output = results.output; // Adjust based on model output name

        // 3. Post-process
        displayResult(output, imageCanvas.width, imageCanvas.height);

        statusText.innerText = '완료!';
        progressBar.style.width = '100%';
        setTimeout(() => loader.classList.add('hidden'), 500);

    } catch (error) {
        console.error('Inpainting failed:', error);
        alert('이미지 처리 중 오류가 발생했습니다: ' + error.message);
        loader.classList.add('hidden');
    }
}

function preprocessImage(canvas, size) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempCanvas.height = size;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, size, size);
    
    const imageData = ctx.getImageData(0, 0, size, size);
    const { data } = imageData;
    const floatData = new Float32Array(3 * size * size);

    for (let i = 0; i < size * size; i++) {
        floatData[i] = data[i * 4] / 255.0;           // R
        floatData[size * size + i] = data[i * 4 + 1] / 255.0; // G
        floatData[2 * size * size + i] = data[i * 4 + 2] / 255.0; // B
    }

    return new ort.Tensor('float32', floatData, [1, 3, size, size]);
}

function preprocessMask(canvas, size) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempCanvas.height = size;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, size, size);
    
    const imageData = ctx.getImageData(0, 0, size, size);
    const { data } = imageData;
    const floatData = new Float32Array(size * size);

    for (let i = 0; i < size * size; i++) {
        // Any pixel with alpha > 0 or red > 0 is part of mask
        floatData[i] = data[i * 4 + 3] > 0 ? 1.0 : 0.0;
    }

    return new ort.Tensor('float32', floatData, [1, 1, size, size]);
}

function displayResult(tensor, width, height) {
    const size = tensor.dims[2];
    const data = tensor.data;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempCanvas.height = size;
    const ctx = tempCanvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);

    for (let i = 0; i < size * size; i++) {
        imageData.data[i * 4] = Math.max(0, Math.min(255, data[i] * 255));
        imageData.data[i * 4 + 1] = Math.max(0, Math.min(255, data[size * size + i] * 255));
        imageData.data[i * 4 + 2] = Math.max(0, Math.min(255, data[2 * size * size + i] * 255));
        imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    // Update main canvas
    imgCtx.clearRect(0, 0, width, height);
    imgCtx.drawImage(tempCanvas, 0, 0, width, height);
    
    // Clear mask and show download
    clearMask();
    
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    imageCanvas.toBlob((blob) => {
        processedImageUrl = URL.createObjectURL(blob);
        downloadBtn.href = processedImageUrl;
        downloadBtn.download = `erased-${Date.now()}.png`;
        downloadBtn.classList.remove('hidden');
        eraseBtn.classList.add('hidden');
    });
}

function resetUI() {
    uploadContainer.classList.remove('hidden');
    editorSection.classList.add('hidden');
    fileInput.value = '';
    clearMask();
    downloadBtn.classList.add('hidden');
    eraseBtn.classList.remove('hidden');
}

// Modal Functionality
const termsLink = document.getElementById('terms-link');
const privacyLink = document.getElementById('privacy-link');
const termsModal = document.getElementById('terms-modal');
const privacyModal = document.getElementById('privacy-modal');

function openModal(modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

termsLink.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(termsModal);
});

privacyLink.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(privacyModal);
});

document.querySelectorAll('.modal-close').forEach(button => {
    button.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        closeModal(modal);
    });
});

[termsModal, privacyModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal);
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal(termsModal);
        closeModal(privacyModal);
    }
});

init();
