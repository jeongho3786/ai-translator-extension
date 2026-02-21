// 스타일 주입 (한 번만 실행)
function injectStyles() {
  if (document.getElementById("ai-translator-styles")) return;

  const style = document.createElement("style");
  style.id = "ai-translator-styles";
  style.textContent = `
    .ai-translator-popover {
      position: fixed;
      z-index: 2147483647;
      background: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      padding: 12px 16px;
      max-width: 400px;
      min-width: 200px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333333;
    }

    .ai-translator-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #666;
    }

    .ai-translator-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #e0e0e0;
      border-top: 2px solid #4a90d9;
      border-radius: 50%;
      animation: ai-translator-spin 0.8s linear infinite;
    }

    @keyframes ai-translator-spin {
      to { transform: rotate(360deg); }
    }

    .ai-translator-header {
      margin-bottom: 4px;
      font-weight: 600;
      font-size: 12px;
      color: #4a90d9;
    }

    .ai-translator-error {
      color: #e74c3c;
    }
  `;
  document.head.appendChild(style);
}

injectStyles();

// 현재 표시 중인 팝오버 요소
let currentPopover = null;

// 팝오버 생성
function createPopover(x, y) {
  removePopover();

  const popover = document.createElement("div");
  popover.classList.add("ai-translator-popover");

  // 화면 밖으로 나가지 않도록 위치 조정
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const popoverMaxWidth = 400; // CSS .ai-translator-popover max-width
  const popoverEstHeight = 200; // 팝오버 예상 최대 높이
  const margin = 10;

  let left = x;
  let top = y + margin; // 커서 아래에 표시

  if (left + popoverMaxWidth > viewportWidth) {
    left = viewportWidth - popoverMaxWidth - margin;
  }
  if (left < margin) {
    left = margin;
  }
  if (top + popoverEstHeight > viewportHeight) {
    top = y - popoverEstHeight + margin; // 공간 부족하면 위에 표시
  }

  popover.style.left = left + "px";
  popover.style.top = top + "px";

  document.body.appendChild(popover);
  currentPopover = popover;

  return popover;
}

// 팝오버 내부 비우기
function clearPopover(popover) {
  while (popover.firstChild) {
    popover.firstChild.remove();
  }
}

// 로딩 상태 표시
function showLoading(popover) {
  clearPopover(popover);

  const wrapper = document.createElement("div");
  wrapper.classList.add("ai-translator-loading");

  const spinner = document.createElement("div");
  spinner.classList.add("ai-translator-spinner");

  const text = document.createElement("span");
  text.textContent = "번역 중...";

  wrapper.appendChild(spinner);
  wrapper.appendChild(text);
  popover.appendChild(wrapper);
}

// 번역 결과 표시
function showResult(popover, translatedText) {
  clearPopover(popover);

  const header = document.createElement("div");
  header.classList.add("ai-translator-header");
  header.textContent = "AI 번역";

  const body = document.createElement("div");
  body.textContent = translatedText;

  popover.appendChild(header);
  popover.appendChild(body);
}

// 에러 표시
function showError(popover, errorMessage) {
  clearPopover(popover);

  const error = document.createElement("div");
  error.classList.add("ai-translator-error");
  error.textContent = "⚠ " + errorMessage;

  popover.appendChild(error);
}

// 팝오버 제거
function removePopover() {
  if (currentPopover) {
    currentPopover.remove();
    currentPopover = null;
  }
}

// 다른 영역 클릭 시 팝오버 닫기
document.addEventListener("mousedown", (e) => {
  if (currentPopover && !currentPopover.contains(e.target)) {
    removePopover();
  }
});

// background.js에서 메시지 수신
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // 단축키: 선택된 텍스트 반환
  if (message.action === "get-selection") {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    sendResponse({ text });
    return;
  }

  if (message.action === "translate") {
    // 사용자가 드래그한 선택 영역 위치 가져오기
    const selection = window.getSelection();

    // popover 위치 기본값
    let x = 0;
    let y = 0;

    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom;
    }

    createPopover(x, y);
    // createPopover 내부에서 currentPopover 할당
    showLoading(currentPopover);
  }

  if (message.action === "translation-result") {
    if (currentPopover) {
      showResult(currentPopover, message.translatedText);
    }
  }

  if (message.action === "translation-error") {
    if (currentPopover) {
      showError(currentPopover, message.error);
    }
  }
});
