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
let processedImageUrl = null;

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

// AI Engine - OpenCV.js Telea inpainting

function waitForOpenCV() {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error('OpenCV.js 로딩 시간 초과. 네트워크 연결을 확인해주세요.')),
            60000
        );
        const check = () => {
            if (typeof cv !== 'undefined' && cv.imread) {
                clearTimeout(timeout);
                resolve();
            } else if (typeof cv !== 'undefined') {
                cv['onRuntimeInitialized'] = () => { clearTimeout(timeout); resolve(); };
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

async function runInpainting() {
    try {
        loader.classList.remove('hidden');
        statusText.innerText = 'AI 엔진 준비 중 (처음 실행 시 잠시 기다려주세요)...';
        if (progressBar) progressBar.style.width = '10%';

        await waitForOpenCV();

        statusText.innerText = '이미지 분석 및 복원 중...';
        if (progressBar) progressBar.style.width = '50%';

        // 원본 이미지 읽기
        const src = cv.imread(imageCanvas);

        // 마스크 캔버스 → 이진 마스크 생성 (브러시로 칠한 영역 = 255)
        const maskRGBA = cv.imread(maskCanvas);
        const gray = new cv.Mat();
        cv.cvtColor(maskRGBA, gray, cv.COLOR_RGBA2GRAY);
        const mask = new cv.Mat();
        cv.threshold(gray, mask, 1, 255, cv.THRESH_BINARY);

        // 마스크 약간 팽창 (브러시 경계 잔상 제거)
        const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        const dilated = new cv.Mat();
        cv.dilate(mask, dilated, kernel);

        // RGBA → BGR 변환 후 인페인팅
        const bgr = new cv.Mat();
        cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);
        const result = new cv.Mat();
        cv.inpaint(bgr, dilated, result, 5, cv.INPAINT_TELEA);

        // BGR → RGBA 변환 후 캔버스에 출력
        const rgba = new cv.Mat();
        cv.cvtColor(result, rgba, cv.COLOR_BGR2RGBA);
        cv.imshow(imageCanvas, rgba);

        [src, maskRGBA, gray, mask, kernel, dilated, bgr, result, rgba].forEach(m => m.delete());

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
