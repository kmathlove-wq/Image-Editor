// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const resultSection = document.getElementById('result-section');
const originalPreview = document.getElementById('original-preview');
const processedPreview = document.getElementById('processed-preview');
const loader = document.getElementById('loader');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');

// Initial State Check
async function checkSecurityContext() {
    console.log('Page loaded. Cross-Origin Isolated:', window.crossOriginIsolated);
    
    if (!window.crossOriginIsolated) {
        console.warn('보안 헤더(COOP/COEP)가 아직 활성화되지 않았습니다. 서비스 워커 등록을 확인합니다.');
        
        // 서비스 워커 등록 상태 확인
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            if (registrations.length === 0) {
                console.log('서비스 워커가 등록되지 않았습니다. coi-serviceworker가 작동 중인지 확인하세요.');
            } else {
                console.log('서비스 워커는 등록되어 있으나, 페이지가 아직 격리되지 않았습니다. 새로고침이 필요할 수 있습니다.');
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
        console.log('Loading library from CDN...');
        const module = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
        
        // ESM 모듈에서 함수 추출
        imglyRemoveBackground = module.default || module.removeBackground;
        
        if (typeof imglyRemoveBackground !== 'function') {
            // 다양한 모듈 구조 대응
            for (const key in module) {
                if (typeof module[key] === 'function') {
                    imglyRemoveBackground = module[key];
                    break;
                }
            }
        }
        
        if (typeof imglyRemoveBackground !== 'function') {
            throw new Error('라이브러리 구조가 올바르지 않습니다.');
        }
        
        console.log('Library loaded successfully.');
        return imglyRemoveBackground;
    } catch (error) {
        console.error('Library loading failed:', error);
        throw new Error('배경 제거 엔진을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
    }
}

// Event Listeners
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
    if (file && file.type.startsWith('image/')) {
        processFile(file);
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
});

resetBtn.addEventListener('click', resetUI);

// Main Processing Function
async function processFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('올바른 이미지 파일을 선택해 주세요.');
        return;
    }

    // UI Reset for new file
    resultSection.classList.remove('hidden');
    dropZone.parentElement.classList.add('hidden');
    loader.classList.remove('hidden');
    processedPreview.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    progressBar.style.width = '0%';
    statusText.innerText = '준비 중...';
    loader.querySelector('.spinner').style.display = 'block';

    // Preview Original
    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    originalImageUrl = URL.createObjectURL(file);
    originalPreview.src = originalImageUrl;

    try {
        statusText.innerText = '엔진 초기화 중...';
        const removeBackground = await loadLibrary();
        
        console.log('Starting background removal for:', file.name);
        const config = {
            // 공식 데이터 패키지 CDN 주소로 변경
            publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.5.5/dist/',
            debug: true,
            model: 'medium', // 안정적인 medium 모델 사용
            progress: (key, current, total) => {
                const percent = Math.round((current / total) * 100);
                progressBar.style.width = `${percent}%`;
                
                if (key.includes('model')) {
                    statusText.innerText = `AI 모델 다운로드 중... (${percent}%)`;
                } else if (key.includes('compute')) {
                    statusText.innerText = `배경 제거 중... (${percent}%)`;
                } else {
                    statusText.innerText = `처리 중... (${percent}%)`;
                }
            }
        };

        const blob = await removeBackground(file, config);

        // Preview Processed
        if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
        processedImageUrl = URL.createObjectURL(blob);
        processedPreview.src = processedImageUrl;
        
        // Final UI Updates
        loader.classList.add('hidden');
        processedPreview.classList.remove('hidden');
        downloadBtn.classList.remove('hidden');
        downloadBtn.href = processedImageUrl;
        downloadBtn.download = `removed-bg-${Date.now()}.png`;
        statusText.innerText = '완료!';

    } catch (error) {
        console.error('Background removal failed:', error);
        statusText.innerText = '오류가 발생했습니다. 다시 시도해 주세요.';
        loader.querySelector('.spinner').style.display = 'none';
        alert('이미지 처리 중 오류가 발생했습니다: ' + error.message);
    }
}

function resetUI() {
    resultSection.classList.add('hidden');
    dropZone.parentElement.classList.remove('hidden');
    fileInput.value = '';
    
    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    if (processedImageUrl) URL.revokeObjectURL(processedImageUrl);
    originalImageUrl = null;
    processedImageUrl = null;
    
    originalPreview.src = '';
    processedPreview.src = '';
    processedPreview.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    loader.classList.add('hidden');
}
