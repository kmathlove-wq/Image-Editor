# 🪄 AI 이미지 배경 제거 (AI Image Background Remover)

AI 기술을 활용하여 클릭 한 번으로 이미지의 배경을 정확하게 제거하는 무료 온라인 도구입니다. 전문가 수준의 '누끼 따기'를 브라우저에서 즉시 완료하세요.

## ✨ 주요 기능
- **100% 자동 처리:** AI가 피사체를 분석하여 배경을 알아서 지워줍니다.
- **개인정보 보호:** 이미지는 서버로 전송되지 않고 브라우저 내에서 안전하게 처리됩니다.
- **빠른 속도:** 복잡한 프로그램 설치 없이 웹에서 5초 내외로 결과물을 얻을 수 있습니다.
- **고해상도 지원:** 투명한 배경의 PNG 형식으로 고품질 결과물을 제공합니다.

## 🚀 사용 기술
- **Frontend:** HTML5, CSS3 (Glassmorphism), JavaScript (ESM)
- **AI Engine:** [@imgly/background-removal](https://github.com/imgly/background-removal-js)
- **Security:** COOP/COEP Headers via Service Worker

## 🛠 설치 및 실행 (로컬 환경)
1. 저장소를 클론합니다.
   ```bash
   git clone https://github.com/kmathlove-wq/Remove-image-background.git
   ```
2. 로컬 서버(예: Live Server)를 통해 `index.html`을 엽니다.
   - **주의:** `SharedArrayBuffer`를 사용하므로 COOP/COEP 헤더가 필요합니다. `coi-serviceworker.js`가 자동으로 이를 처리합니다.

## 📄 라이선스
MIT License

---
&copy; 2026 AI Image Tools. Built with Advanced AI Technology.
