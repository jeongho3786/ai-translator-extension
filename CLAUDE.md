# AI Translator Extension

## 프로젝트 개요

영어 텍스트를 드래그하고 우클릭 메뉴를 통해 AI(Claude, Gemini, ChatGPT)로 번역하는 Firefox 익스텐션

### 주요 기능
1. 웹사이트 내 영어 문장 드래그
2. 우클릭 메뉴 "AI로 번역하기" 클릭 또는 단축키(`Ctrl+Shift+Y`)로 번역 실행
3. AI API 연동하여 한글 번역
4. 번역 결과를 팝오버로 표시
5. 다른 영역 클릭 시 팝오버 사라짐
6. 우클릭 메뉴 "AI 문장 파헤치기"로 사이드바에서 문장 상세 분석 (구조, 직독직해, 문법)

---

## 파일 구조

```
ai-translator-extension/
  ├── manifest.json    (익스텐션 설정 - 설계도)
  ├── background.js    (우클릭 메뉴 + 단축키 처리 + Claude API 호출 + 문장 분석)
  ├── content.js       (웹페이지에서 실행 - 페이지마다 주입)
  ├── popup.html       (API 키 입력 팝업 UI)
  ├── popup.js         (팝업 로직 - 키 저장/로드)
  ├── sidebar.html     (사이드바 UI - 문장 분석 결과 표시)
  └── sidebar.js       (사이드바 로직 - 분석 데이터 요청 + 렌더링)
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
  "commands": {...},
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
    translateWithAI(info.selectionText, tab.id);
  }
});
```

### 3. 단축키 입력 처리
```javascript
browser.commands.onCommand.addListener((command) => {
  if (command === "translate-selection") {
    // 1. 현재 활성 탭 조회 (commands는 tab 정보를 제공하지 않음)
    // 2. content.js에 get-selection 메시지로 선택 텍스트 요청
    // 3. 응답받은 텍스트로 translate 메시지 전송 + API 호출
  }
});
```
- `commands.onCommand`은 command ID만 전달 (선택 텍스트, 탭 정보 없음)
- 우클릭과 달리 `tabs.query` → `get-selection` 요청 → 응답 수신의 추가 단계 필요
- 선택된 텍스트가 없으면(`!response.text`) 아무 동작 없이 종료

### 4. Claude API 호출 (`translateWithAI`)
- `browser.storage.local`에서 API 키 읽기
- API 키 없으면 `translation-error` 메시지 전송
- `POST https://api.anthropic.com/v1/messages` 호출
  - 헤더: `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access` (브라우저 직접 호출 허용)
  - 시스템 프롬프트: 영어/일본어 → 한국어 번역, 번역 결과만 출력
  - 모델: `claude-sonnet-4-5-20250929`
- 성공 시 `translation-result`, 실패 시 `translation-error` 메시지를 content.js에 전송

### 실행 흐름

**우클릭 방식:**
```
텍스트 드래그 → 우클릭 → "AI로 번역하기" 클릭
  → background.js가 info.selectionText + tab 바로 수신
  → content.js에 translate 메시지 + API 호출
```

**단축키 방식:**
```
텍스트 드래그 → Ctrl+Shift+Y
  → background.js가 command ID만 수신 (텍스트·탭 정보 없음)
  → tabs.query로 현재 탭 조회
  → content.js에 get-selection 요청
  → content.js가 선택 텍스트 응답 (sendResponse)
  → content.js에 translate 메시지 + API 호출
```

**공통 흐름 (API 호출 이후):**
```
translateWithAI(text, tabId) 호출
  → Claude API 응답 수신
  → content.js에 translation-result 또는 translation-error 전송
  → 팝오버에 번역 결과/에러 표시
```

---

## content.js 설명

background.js에서 보낸 메시지를 수신하고, 팝오버 UI로 번역 결과를 표시

### 구조
- **스타일 주입**: `injectStyles()` - `<style>` 태그를 `<head>`에 한 번만 주입, `.ai-translator-*` 클래스로 스타일 관리
- **팝오버 생성**: `createPopover(x, y)` - 선택한 텍스트 위치에 팝오버 생성, 화면 밖 안 나가도록 위치 자동 조정
- **상태 표시**: `showLoading()`, `showResult()`, `showError()` - 로딩/결과/에러 상태를 DOM API로 렌더링
- **팝오버 제거**: `removePopover()` - 외부 클릭(`mousedown`) 시 팝오버 닫기
- **메시지 수신**: `browser.runtime.onMessage` - 4가지 액션 처리
  - `get-selection`: 현재 선택된 텍스트를 `sendResponse`로 반환 (단축키용)
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

## sidebar.html / sidebar.js 설명

우클릭 → "AI 문장 파헤치기" 시 열리는 사이드바. 선택한 텍스트의 상세 분석 결과를 표시.

### 메시지 흐름
```
텍스트 드래그 → 우클릭 → "AI 문장 파헤치기"
  → background.js: latestAnalysis 저장 → sidebarAction.open() → analyzeWithAI()
  → sidebar.js: 로드 시 get-analysis로 현재 상태 요청 → 로딩/결과 표시
  → background.js: API 응답 → analysis-result 메시지 → sidebar.js 렌더링
```

### sidebar.js 구조
- **초기 로드**: `get-analysis` 메시지로 background.js에 현재 분석 상태 요청
- **실시간 수신**: `runtime.onMessage`로 `analysis-loading`, `analysis-result`, `analysis-error` 처리
- **렌더링 함수**: `showEmpty()`, `showLoading()`, `showError()`, `renderResult()`, `renderSingleAnalysis()`, `renderMultiAnalysis()`
- **단일 문장**: 원문 → 번역 → 문장 구조 → 직독직해 → 문법 노트
- **여러 문장**: 문장 카드 목록 + 각 카드에 "파헤치기" 버튼 → 클릭 시 `analyze-single` 메시지로 개별 분석 요청
- **뒤로가기**: 개별 분석 후 `multiAnalysisData`가 있으면 "← 전체 문장 목록" 버튼 표시

### background.js 추가 사항
- **프롬프트 상수**: `SINGLE_SENTENCE_PROMPT` (문장 구조 + 직독직해 + 문법), `MULTI_SENTENCE_PROMPT` (문장별 직독직해)
- **`latestAnalysis`**: 사이드바 데이터 유실 방지용 상태 변수
- **`analyzeWithAI(text)`**: 문장 수 판별 → 프롬프트 선택 → API 호출 → JSON 파싱 → 결과 전송
- **`splitSentences(text)`**: `.!?` 뒤 공백으로 문장 분리
- **`runtime.onMessage`**: `get-analysis` (상태 반환), `analyze-single` (개별 분석)

### 코드 컨벤션
- content.js와 동일: DOM API + textContent + 클래스 기반 스타일
- 클래스 프리픽스: `.ai-translator-sidebar-*`

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
5. 웹페이지에서 텍스트 드래그 → 우클릭 → "AI로 번역하기" 또는 `Ctrl+Shift+Y`

---

## 개발 단계

- [x] 1단계: 기본 프로젝트 구조 생성
- [x] 2단계: 우클릭 컨텍스트 메뉴 추가 (1단계에 포함)
- [x] 3단계: 팝오버 UI 구현 (DOM API + 클래스 기반 스타일)
- [x] 4단계: Claude API 연동 + API 키 입력 팝업
- [x] 5단계: 설정 페이지 구현 (API 키 입력)
- [x] 6단계: 단축키 번역 기능 추가 (`Ctrl+Shift+Y`)

### 다음 개발 계획

- [x] 7단계: 사이드바 문장 분석 기능
  - Firefox `sidebar_action`으로 우측 사이드바 구현 (`Ctrl+Shift+S`로 토글)
  - 팝오버에 "문장 파헤치기" 버튼 추가
  - AI API에 분석용 프롬프트(JSON 응답)를 보내 문장 분석 제공
  - **한 문장**: 문장 구조(주어, 동사 등) + 직독직해 + 알아두면 좋은 문법/구문
  - **여러 문장**: 각 문장별 직독직해 + 개별 "파헤치기" 버튼 → 클릭 시 상세 분석
  - 새 파일: `sidebar.html`, `sidebar.js`
  - 수정 파일: `manifest.json`, `background.js`, `content.js`
  - 사이드바 열기 제약: `sidebarAction.open()`은 사용자 제스처 내에서만 호출 가능 → `_execute_sidebar_action` 단축키로 해결
  - 데이터 유실 방지: background.js에 `latestAnalysis` 저장 → 사이드바 열릴 때 `get-analysis`로 요청
  - 사이드바 너비: Firefox 기본 드래그 리사이즈 사용 (별도 구현 불필요)
  - 상세 구현 계획: `.claude/plans/recursive-greeting-allen.md` 참조

- [ ] 8단계: Firefox 익스텐션 배포
  - Firefox Add-ons (addons.mozilla.org)에 제출
  - 배포에 필요한 파일 정리 및 패키징 (.zip)
  - manifest.json 검증 및 배포 요구사항 확인

- [ ] 9단계: 멀티 AI 서비스 지원
  - 사용자가 AI 서비스(Claude, GPT, Gemini)를 선택하고 해당 API 키를 입력
  - 서비스별로 URL, 인증 헤더, 요청 body 구조, 응답 파싱이 다르므로 각각 처리 필요
    | 항목 | Claude | OpenAI (GPT) | Gemini |
    |------|--------|-------------|--------|
    | URL | `api.anthropic.com/v1/messages` | `api.openai.com/v1/chat/completions` | `generativelanguage.googleapis.com/...` |
    | 인증 헤더 | `x-api-key` | `Authorization: Bearer` | URL 파라미터 `key=` |
    | body 구조 | `{ model, system, messages }` | `{ model, messages }` (system이 messages 안에 포함) | `{ contents }` |
    | 응답 파싱 | `content[0].text` | `choices[0].message.content` | `candidates[0].content.parts[0].text` |
  - popup.html에 서비스 선택 드롭다운 추가
  - 선택된 서비스 + API 키를 `browser.storage.local`에 저장
  - background.js에서 저장된 서비스에 따라 호출 URL, 헤더, body, 파싱 분기

- [ ] 10단계: TTS(음성 읽기) 기능 추가
  - 브라우저 내장 `speechSynthesis` API로 원문 음성 재생
  - 사이드바에 TTS 재생 버튼 배치
  - 필요 시 외부 TTS API로 교체 가능하도록 구조 설계

---

## API 키 보안 참고

- 각 사용자가 자신의 API 키를 입력하는 방식
- API 키는 `browser.storage.local`에 저장됨
- 개인 사용 시 프록시 서버 불필요
- API 제공자 콘솔에서 사용량 제한 설정 권장
