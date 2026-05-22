import imglyRemoveBackground from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';

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

// State
let originalImageUrl = null;
let processedImageUrl = null;

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
    // UI Reset for new file
    resultSection.classList.remove('hidden');
    dropZone.parentElement.classList.add('hidden');
    loader.classList.remove('hidden');
    processedPreview.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    progressBar.style.width = '0%';
    statusText.innerText = '준비 중...';

    // Preview Original
    if (originalImageUrl) URL.revokeObjectURL(originalImageUrl);
    originalImageUrl = URL.createObjectURL(file);
    originalPreview.src = originalImageUrl;

    try {
        const config = {
            debug: true, // 디버그 로그 활성화
            model: 'medium', // 기본 모델 설정
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

        statusText.innerText = '이미지 분석 중...';
        const blob = await imglyRemoveBackground(file, config);

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
