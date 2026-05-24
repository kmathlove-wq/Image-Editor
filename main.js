// DOM Elements
const getEl = (id) => document.getElementById(id);

const dropZone = getEl('drop-zone');
const fileInput = getEl('file-input');
const resultSection = getEl('result-section');
const originalPreview = getEl('original-preview');
const processedPreview = getEl('processed-preview');
const loader = getEl('loader');
const progressBar = getEl('progress-bar');
const statusText = getEl('status-text');
const downloadBtn = getEl('download-btn');
const resetBtn = getEl('reset-btn');

// Initial State Check
async function checkSecurityContext() {
    if (!window.crossOriginIsolated) {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            if (registrations.length === 0) {
                console.log('서비스 워커가 등록되지 않았습니다.');
            }
        }
    }
}

checkSecurityContext();

// State
let imglyRemoveBackground = null;
let originalImageUrl = null;
let processedImageUrl = null;

// Library Loader
async function loadLibrary() {
    if (imglyRemoveBackground) return imglyRemoveBackground;
    
    try {
        const module = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
        imglyRemoveBackground = module.default || module.removeBackground;
        
        if (typeof imglyRemoveBackground !== 'function') {
            for (const key in module) {
                if (typeof module[key] === 'function') {
                    imglyRemoveBackground = module[key];
                    break;
                }
            }
        }
        return imglyRemoveBackground;
    } catch (error) {
        throw new Error('배경 제거 엔진을 불러오지 못했습니다.');
    }
}

// Event Listeners (Safe attachment)
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
        if (file && file.type.startsWith('image/')) processFile(file);
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) processFile(file);
    });
}

if (resetBtn) resetBtn.addEventListener('click', resetUI);

async function processFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    resultSection.classList.remove('hidden');
    dropZone.parentElement.classList.add('hidden');
    loader.classList.remove('hidden');
    processedPreview.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    progressBar.style.width = '0%';
    statusText.innerText = '준비 중...';

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    originalImageUrl = URL.createObjectURL(file);
    originalPreview.src = originalImageUrl;

    try {
        const removeBackground = await loadLibrary();
        const config = {
            publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.5.5/dist/',
            model: 'medium',
            progress: (key, current, total) => {
                const percent = Math.round((current / total) * 100);
                progressBar.style.width = `${percent}%`;
                statusText.innerText = `이미지 처리 중... (${percent}%)`;
            }
        };

        const blob = await removeBackground(file, config);

        if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
        processedImageUrl = URL.createObjectURL(blob);
        processedPreview.src = processedImageUrl;
        
        loader.classList.add('hidden');
        processedPreview.classList.remove('hidden');
        downloadBtn.classList.remove('hidden');
        downloadBtn.href = processedImageUrl;
        downloadBtn.download = `removed-bg-${Date.now()}.png`;
        statusText.innerText = '완료!';
    } catch (error) {
        statusText.innerText = '오류가 발생했습니다.';
        alert('이미지 처리 중 오류: ' + error.message);
    }
}

function resetUI() {
    resultSection.classList.add('hidden');
    dropZone.parentElement.classList.remove('hidden');
    fileInput.value = '';
    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    originalImageUrl = processedImageUrl = null;
    originalPreview.src = processedPreview.src = '';
}

// Modal Logic (Safe)
const setupModals = () => {
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
};

setupModals();
