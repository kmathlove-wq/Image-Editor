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

    syncUndoBtn();
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
    syncUndoBtn();
}

function saveHistory() {
    if (!maskCtx) return;
    drawHistory.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
    if (drawHistory.length > 20) drawHistory.shift();
    syncUndoBtn();
}

function undo() {
    if (drawHistory.length > 0 && maskCtx) {
        maskCtx.putImageData(drawHistory.pop(), 0, 0);
        syncUndoBtn();
    }
}

function syncUndoBtn() {
    if (undoBtn) undoBtn.disabled = drawHistory.length === 0;
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

        statusText.innerText = '이미지 분석 중...';
        if (progressBar) progressBar.style.width = '30%';

        const src = cv.imread(imageCanvas);

        // ── 1. 브러시 마스크 생성 ──────────────────────────────────────
        const maskRGBA = cv.imread(maskCanvas);
        const grayMask = new cv.Mat();
        cv.cvtColor(maskRGBA, grayMask, cv.COLOR_RGBA2GRAY);
        const mask = new cv.Mat();
        cv.threshold(grayMask, mask, 1, 255, cv.THRESH_BINARY);

        const bgr = new cv.Mat();
        cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);

        // ── 2. 피사체 어두운 윤곽선·그림자 자동 감지 → 마스크에 포함 ────────
        // 그림자는 피사체에서 멀리까지 뻗으므로 이미지 비례 탐색 반경 사용
        const shadowR = Math.max(50, Math.round(Math.min(bgr.cols, bgr.rows) * 0.1));
        const kShadow = cv.Mat.ones(shadowR, shadowR, cv.CV_8U);
        const nearMask = new cv.Mat();
        cv.dilate(mask, nearMask, kShadow);
        kShadow.delete();

        // 마스크 근방 밖 = 순수 배경 픽셀
        const notNear = new cv.Mat();
        cv.bitwise_not(nearMask, notNear);

        // 배경 평균 밝기 측정
        const imgGray = new cv.Mat();
        cv.cvtColor(bgr, imgGray, cv.COLOR_BGR2GRAY);
        const meanMat = new cv.Mat(), stdMat = new cv.Mat();
        cv.meanStdDev(imgGray, meanMat, stdMat, notNear);
        const bgLum  = meanMat.data64F[0];
        const bgStd  = stdMat.data64F[0];
        meanMat.delete(); stdMat.delete();

        // 배경보다 어두운 픽셀(= 피사체 경계 및 그림자)을 마스크에 포함
        // 임계값을 낮춰(0.8σ) 옅은 그림자까지 감지
        const darkThresh = Math.max(10, bgLum - bgStd * 0.8);
        const darkMap = new cv.Mat();
        cv.threshold(imgGray, darkMap, darkThresh, 255, cv.THRESH_BINARY_INV);
        imgGray.delete();

        const darkNear = new cv.Mat();
        cv.bitwise_and(darkMap, nearMask, darkNear);
        darkMap.delete(); nearMask.delete();

        const extMask = new cv.Mat();
        cv.bitwise_or(mask, darkNear, extMask);
        mask.delete(); darkNear.delete();

        // ── 3. 확장된 마스크 팽창 (7×7, 2회) ────────────────────────
        const k7 = cv.Mat.ones(7, 7, cv.CV_8U);
        const dilated = new cv.Mat();
        cv.dilate(extMask, dilated, k7, new cv.Point(-1, -1), 2);
        k7.delete(); extMask.delete();

        // ── 4. 공간 인식 배경 추정 (정규화 블러) ────────────────────
        // 단순 평균 대신 위치별 배경색을 추정 → 그라디언트·그림자 처리
        statusText.innerText = '배경 패턴 분석 중...';
        if (progressBar) progressBar.style.width = '55%';

        const sc = 4; // 저해상도 처리로 속도 향상
        const sW = Math.max(4, Math.floor(bgr.cols / sc));
        const sH = Math.max(4, Math.floor(bgr.rows / sc));

        // 저해상도 BGR·마스크
        const sBgr = new cv.Mat();
        cv.resize(bgr, sBgr, new cv.Size(sW, sH));
        const sDil = new cv.Mat();
        cv.resize(dilated, sDil, new cv.Size(sW, sH), 0, 0, cv.INTER_NEAREST);
        cv.threshold(sDil, sDil, 127, 255, cv.THRESH_BINARY);

        // 마스크 영역 제로 처리 후 float 변환
        const bgF = new cv.Mat();
        sBgr.convertTo(bgF, cv.CV_32FC3, 1.0 / 255.0);
        bgF.setTo(new cv.Scalar(0, 0, 0), sDil);
        sBgr.delete();

        // 가중치 맵: 배경=1.0, 마스크=0.0
        const invSDil = new cv.Mat();
        cv.bitwise_not(sDil, invSDil);
        sDil.delete();
        const wF = new cv.Mat();
        invSDil.convertTo(wF, cv.CV_32F, 1.0 / 255.0);
        invSDil.delete();

        // 박스 블러 4회 ≈ 가우시안 (배경 색상 공간 보간)
        const bSz = Math.max(5, (Math.floor(Math.min(sW, sH) / 3) * 2 + 1));
        const bk = new cv.Size(bSz, bSz);
        for (let i = 0; i < 4; i++) {
            cv.blur(bgF, bgF, bk);
            cv.blur(wF, wF, bk);
        }

        // 3채널 가중치 생성 후 정규화 나눗셈 → 위치별 배경 추정
        const wA = wF.clone(), wB = wF.clone();
        const wVec = new cv.MatVector();
        wVec.push_back(wF); wVec.push_back(wA); wVec.push_back(wB);
        const wF3 = new cv.Mat();
        cv.merge(wVec, wF3);
        wVec.delete(); wF.delete(); wA.delete(); wB.delete();

        const estF = new cv.Mat();
        cv.divide(bgF, wF3, estF, 1.0);
        bgF.delete(); wF3.delete();

        // uint8 변환 → 원래 크기 업스케일
        const est8 = new cv.Mat();
        estF.convertTo(est8, cv.CV_8UC3, 255.0);
        estF.delete();

        const bgEst = new cv.Mat();
        cv.resize(est8, bgEst, new cv.Size(bgr.cols, bgr.rows));
        est8.delete();

        // 마스크 영역에 위치별 배경 추정값 적용
        const prefilled = bgr.clone();
        bgEst.copyTo(prefilled, dilated);
        bgEst.delete();

        // ── 5. Telea 인페인팅 (반경 5) — 경계 블렌딩만 담당 ────────
        statusText.innerText = '경계 정리 중...';
        if (progressBar) progressBar.style.width = '85%';

        const result = new cv.Mat();
        cv.inpaint(prefilled, dilated, result, 5, cv.INPAINT_TELEA);
        prefilled.delete();

        // BGR → RGBA → 캔버스 출력
        const rgba = new cv.Mat();
        cv.cvtColor(result, rgba, cv.COLOR_BGR2RGBA);
        cv.imshow(imageCanvas, rgba);

        [src, maskRGBA, grayMask, bgr, notNear, dilated, result, rgba].forEach(m => m.delete());

        clearMask();
        if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
        imageCanvas.toBlob((blob) => {
            processedImageUrl = URL.createObjectURL(blob);
            if (downloadBtn) {
                downloadBtn.href = processedImageUrl;
                downloadBtn.download = `erased-${Date.now()}.png`;
                downloadBtn.classList.remove('hidden');
            }
            // eraseBtn 유지 → 추가 패스 가능
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
