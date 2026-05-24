// DOM Elements
const getEl = (id) => document.getElementById(id);

const dropZone = getEl('drop-zone');
const fileInput = getEl('file-input');
const uploadContainer = getEl('upload-container');
const editorSection = getEl('editor-section');
const imageCanvas = getEl('image-canvas');
const maskCanvas = getEl('mask-canvas');
const brushSizeInput = getEl('brush-size');
const brushSizeValue = getEl('brush-size-value');
const undoBtn = getEl('undo-btn');
const clearBtn = getEl('clear-btn');
const resetBtn = getEl('reset-btn');
const eraseBtn = getEl('erase-btn');
const downloadBtn = getEl('download-btn');
const loader = getEl('editor-loader');
const progressBar = getEl('progress-bar');
const statusText = getEl('status-text');

// Contexts
const imgCtx = imageCanvas ? imageCanvas.getContext('2d') : null;
const maskCtx = maskCanvas ? maskCanvas.getContext('2d', { willReadFrequently: true }) : null;

// State
let originalImage = null;
let isDrawing = false;
let brushSize = 30;
let drawHistory = [];
let session = null;
let processedImageUrl = null;

// Model URL - Reverting to verified lama_fp32 model
const MODEL_URL = 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx';

// Initialize
async function init() {
    if (!maskCanvas || !imgCtx || !maskCtx) return;

    if (brushSizeInput) {
        brushSizeInput.addEventListener('input', (e) => {
            brushSize = parseInt(e.target.value);
            if (brushSizeValue) brushSizeValue.innerText = `${brushSize}px`;
        });
    }

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
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (clearBtn) clearBtn.addEventListener('click', clearMask);
    if (resetBtn) resetBtn.addEventListener('click', resetUI);
    if (eraseBtn) eraseBtn.addEventListener('click', runInpainting);

    // Upload Events
    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) processFile(file);
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) processFile(file);
        });
    }

    setupModals();
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
    const x = (e.clientX - rect.left) * (maskCanvas.width / rect.width);
    const y = (e.clientY - rect.top) * (maskCanvas.height / rect.height);

    maskCtx.lineWidth = brushSize;
    maskCtx.lineCap = 'round';
    maskCtx.strokeStyle = 'rgba(255, 0, 0, 1)';
    
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
    if (!maskCtx) return;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    drawHistory = [];
}

function saveHistory() {
    if (!maskCtx) return;
    drawHistory.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
    if (drawHistory.length > 20) drawHistory.shift();
}

function undo() {
    if (drawHistory.length > 0 && maskCtx) {
        maskCtx.putImageData(drawHistory.pop(), 0, 0);
    }
}

// AI Engine
async function loadModel() {
    if (session) return session;

    if (typeof ort === 'undefined') {
        throw new Error('ONNX Runtime 라이브러리를 불러오지 못했습니다. 페이지를 새로고침 해주세요.');
    }

    try {
        statusText.innerText = 'AI 환경을 준비하는 중...';
        if (progressBar) progressBar.style.width = '10%';

        // numThreads=1: SharedArrayBuffer 없이 동작 (서비스워커 격리 불필요)
        ort.env.wasm.numThreads = 1;

        statusText.innerText = 'AI 모델을 불러오는 중 (약 200MB, 처음에만 오래 걸립니다)...';
        if (progressBar) progressBar.style.width = '30%';

        const options = {
            executionProviders: ['wasm'],
            graphOptimizationLevel: 'all'
        };

        session = await ort.InferenceSession.create(MODEL_URL, options);
        if (progressBar) progressBar.style.width = '100%';
        return session;
    } catch (error) {
        console.error('Model loading failed:', error);
        throw new Error('AI 모델 로딩 실패: ' + (error.message || String(error)));
    }
}

async function runInpainting() {
    try {
        loader.classList.remove('hidden');
        statusText.innerText = 'AI 엔진 준비 중...';
        if (progressBar) progressBar.style.width = '10%';

        const model = await loadModel();
        statusText.innerText = '이미지 분석 및 처리 중...';
        if (progressBar) progressBar.style.width = '50%';

        const size = 512;
        const inputImg = preprocessImage(imageCanvas, size);
        const inputMask = preprocessMask(maskCanvas, size);

        const feeds = {
            image: inputImg,
            mask: inputMask
        };

        const results = await model.run(feeds);
        const output = results.output || results[Object.keys(results)[0]];

        displayResult(output, imageCanvas.width, imageCanvas.height);

        statusText.innerText = '완료!';
        if (progressBar) progressBar.style.width = '100%';
        setTimeout(() => loader.classList.add('hidden'), 500);

    } catch (error) {
        console.error('Inpainting failed:', error);
        if (statusText) statusText.innerText = '오류 발생';
        alert('이미지 처리 중 오류가 발생했습니다:\n' + (error.message || String(error)));
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
        floatData[i] = data[i * 4] / 255.0;
        floatData[size * size + i] = data[i * 4 + 1] / 255.0;
        floatData[2 * size * size + i] = data[i * 4 + 2] / 255.0;
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

    imgCtx.clearRect(0, 0, width, height);
    imgCtx.drawImage(tempCanvas, 0, 0, width, height);
    
    clearMask();
    
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    imageCanvas.toBlob((blob) => {
        processedImageUrl = URL.createObjectURL(blob);
        if (downloadBtn) {
            downloadBtn.href = processedImageUrl;
            downloadBtn.download = `erased-${Date.now()}.png`;
            downloadBtn.classList.remove('hidden');
        }
        if (eraseBtn) eraseBtn.classList.add('hidden');
    });
}

function resetUI() {
    if (uploadContainer) uploadContainer.classList.remove('hidden');
    if (editorSection) editorSection.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    clearMask();
    if (downloadBtn) downloadBtn.classList.add('hidden');
    if (eraseBtn) eraseBtn.classList.remove('hidden');
}

// Modal Logic
function setupModals() {
    const termsLink = getEl('terms-link');
    const privacyLink = getEl('privacy-link');
    const termsModal = getEl('terms-modal');
    const privacyModal = getEl('privacy-modal');

    if (!termsLink || !privacyLink || !termsModal || !privacyModal) return;

    const openModal = (m) => {
        m.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };
    const closeModal = (m) => {
        m.classList.add('hidden');
        document.body.style.overflow = 'auto';
    };

    termsLink.addEventListener('click', (e) => { e.preventDefault(); openModal(termsModal); });
    privacyLink.addEventListener('click', (e) => { e.preventDefault(); openModal(privacyModal); });

    document.querySelectorAll('.modal-close').forEach(b => {
        b.addEventListener('click', () => {
            const m = b.closest('.modal');
            if (m) closeModal(m);
        });
    });

    [termsModal, privacyModal].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(termsModal);
            closeModal(privacyModal);
        }
    });
}

init();
