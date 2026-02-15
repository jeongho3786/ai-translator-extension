# AI Translator Extension

## 프로젝트 개요

영어 텍스트를 드래그하고 우클릭 메뉴를 통해 AI(Claude, Gemini, ChatGPT)로 번역하는 Firefox 익스텐션

### 주요 기능
1. 웹사이트 내 영어 문장 드래그
2. 우클릭 메뉴 "AI로 번역하기" 클릭
3. AI API 연동하여 한글 번역
4. 번역 결과를 팝오버로 표시
5. 다른 영역 클릭 시 팝오버 사라짐

---

## 파일 구조

```
ai-translator-extension/
  ├── manifest.json    (익스텐션 설정 - 설계도)
  ├── background.js    (우클릭 메뉴 처리 + Claude API 호출)
  ├── content.js       (웹페이지에서 실행 - 페이지마다 주입)
  ├── popup.html       (API 키 입력 팝업 UI)
  └── popup.js         (팝업 로직 - 키 저장/로드)
```

---

## manifest.json 설명

### 기본 구조
```json
{
  "manifest_version": 2,
  "name": "AI Translator",
  "version": "1.0",
  "description": "선택한 영어 텍스트를 AI로 번역합니다",
  "permissions": [...],
  "background": {...},
  "content_scripts": [...]
}
```

### permissions (권한)
익스텐션이 브라우저에게 "이 기능을 사용할게요"라고 요청하는 것

| 권한 | 용도 |
|------|------|
| `contextMenus` | 우클릭 메뉴 추가 |
| `activeTab` | 현재 활성 탭에 접근 |
| `storage` | 로컬에 데이터 저장 (API 키 등) |
| `tabs` | 모든 탭 정보 접근 |
| `notifications` | 알림 표시 |
| `clipboardWrite` | 클립보드에 복사 |
| `https://api.anthropic.com/*` | Claude API 서버에 HTTP 요청 허용 |

### background vs content_scripts

| 파일 | 언제 실행? | 어디서 실행? |
|------|-----------|-------------|
| `background.js` | 익스텐션 로드 시 **1번** | 브라우저 백그라운드 |
| `content.js` | 웹페이지 열 때 **매번** | 해당 웹페이지 내부 |

### content_scripts의 matches
어떤 웹사이트에서 스크립트를 실행할지 지정

| 패턴 | 의미 |
|------|------|
| `<all_urls>` | 모든 웹사이트 |
| `*://*.google.com/*` | 구글 도메인 전체 |
| `https://github.com/*` | GitHub (https만) |

---

## background.js 설명

### 1. 우클릭 메뉴 생성
```javascript
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "translate-selection",    // 메뉴 고유 ID
    title: "AI로 번역하기",         // 표시 텍스트
    contexts: ["selection"]       // 텍스트 선택 시에만 표시
  });
});
```

### 2. 메뉴 클릭 처리 + API 호출
```javascript
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection") {
    // content.js에 로딩 표시 메시지 전송
    browser.tabs.sendMessage(tab.id, {
      action: "translate",
      text: info.selectionText
    });
    // Claude API 호출
    translateWithClaude(info.selectionText, tab.id);
  }
});
```

### 3. Claude API 호출 (`translateWithClaude`)
- `browser.storage.local`에서 API 키 읽기
- API 키 없으면 `translation-error` 메시지 전송
- `POST https://api.anthropic.com/v1/messages` 호출
  - 헤더: `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access` (브라우저 직접 호출 허용)
  - 시스템 프롬프트: 영어/일본어 → 한국어 번역, 번역 결과만 출력
  - 모델: `claude-sonnet-4-5-20250929`
- 성공 시 `translation-result`, 실패 시 `translation-error` 메시지를 content.js에 전송

### 실행 흐름
```
텍스트 드래그 → 우클릭 → "AI로 번역하기" 클릭
                              ↓
                   background.js가 감지
                              ↓
              ┌───────────────┴───────────────┐
              ↓                               ↓
   content.js에 메시지 전송            Claude API 호출
   { action: "translate" }                    ↓
   → 로딩 팝오버 표시              API 응답 수신
                                              ↓
                                 content.js에 결과 전송
                                 { action: "translation-result" }
                                 또는 { action: "translation-error" }
                                              ↓
                                 팝오버에 번역 결과/에러 표시
```

---

## content.js 설명

background.js에서 보낸 메시지를 수신하고, 팝오버 UI로 번역 결과를 표시

### 구조
- **스타일 주입**: `injectStyles()` - `<style>` 태그를 `<head>`에 한 번만 주입, `.ai-translator-*` 클래스로 스타일 관리
- **팝오버 생성**: `createPopover(x, y)` - 선택한 텍스트 위치에 팝오버 생성, 화면 밖 안 나가도록 위치 자동 조정
- **상태 표시**: `showLoading()`, `showResult()`, `showError()` - 로딩/결과/에러 상태를 DOM API로 렌더링
- **팝오버 제거**: `removePopover()` - 외부 클릭(`mousedown`) 시 팝오버 닫기
- **메시지 수신**: `browser.runtime.onMessage` - 3가지 액션 처리
  - `translate`: 로딩 팝오버 표시
  - `translation-result`: 번역 결과 표시
  - `translation-error`: 에러 메시지 표시

### 코드 컨벤션
- `innerHTML` / `cssText` 문자열 대신 **DOM API**(`createElement`, `textContent`, `classList`) 사용
- 스타일은 **클래스 기반** (인라인 스타일은 동적 위치값만 허용)
- XSS 방지를 위해 `textContent` 사용 (`innerHTML` 사용 금지)

### 모듈 분리에 대한 결정
- content_scripts는 ES 모듈(`import`/`export`)을 지원하지 않음
- manifest.json `js` 배열에 여러 파일 나열 시 순서대로 실행되며 같은 전역 스코프 공유
- 현재 코드 규모(약 160줄)에서는 **단일 파일 유지**, 커지면 파일 분리 또는 번들러 도입 검토

---

## popup.html / popup.js 설명

익스텐션 아이콘 클릭 시 열리는 팝업. Claude API 키를 입력/저장하는 UI.

### 구조
- `popup.html`: API 키 입력 필드(`type="password"`) + 저장 버튼 + 상태 메시지
- `popup.js`: 저장/로드 로직

### popup.js 동작
- **로드 시**: `browser.storage.local`에서 저장된 키를 읽어 마스킹 표시 (`sk-ant-...xY1z`)
- **입력 필드 포커스**: 마스킹된 값을 비우고 새 키 입력 준비 (`dataset.saved` 플래그로 구분)
- **저장 버튼 클릭**: 새 키를 `browser.storage.local`에 저장 후 마스킹 표시로 전환
- `dataset.saved` 플래그: 입력 필드에 표시된 값이 마스킹된 기존 키(`"true"`)인지 새로 입력한 키(`"false"`)인지 구분

### browser_action (manifest.json)
```json
"browser_action": {
  "default_popup": "popup.html",
  "default_title": "AI Translator 설정"
}
```
- `default_popup`: 아이콘 클릭 시 열리는 HTML 파일
- `default_title`: 아이콘 마우스 오버 시 툴팁

---

## Firefox에서 테스트 방법

1. Firefox 주소창에 `about:debugging` 입력
2. 왼쪽에서 "This Firefox" 클릭
3. "Load Temporary Add-on..." 클릭
4. `manifest.json` 파일 선택
5. 웹페이지에서 텍스트 드래그 → 우클릭 → "AI로 번역하기"

---

## 개발 단계

- [x] 1단계: 기본 프로젝트 구조 생성
- [x] 2단계: 우클릭 컨텍스트 메뉴 추가 (1단계에 포함)
- [x] 3단계: 팝오버 UI 구현 (DOM API + 클래스 기반 스타일)
- [x] 4단계: Claude API 연동 + API 키 입력 팝업
- [x] 5단계: 설정 페이지 구현 (API 키 입력)

---

## API 키 보안 참고

- 각 사용자가 자신의 API 키를 입력하는 방식
- API 키는 `browser.storage.local`에 저장됨
- 개인 사용 시 프록시 서버 불필요
- API 제공자 콘솔에서 사용량 제한 설정 권장
