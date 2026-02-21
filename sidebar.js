const contentEl = document.getElementById("content");
const headerEl = document.getElementById("sidebar-header");

// 여러 문장 분석 결과를 저장 (뒤로가기용)
let multiAnalysisData = null;

// --- 초기 로드: background.js에 현재 분석 상태 요청 ---

browser.runtime.sendMessage({ action: "get-analysis" }).then((analysis) => {
  if (!analysis) {
    showEmpty();
    return;
  }

  if (analysis.status === "loading") {
    showLoading(analysis.text);
  } else if (analysis.status === "done") {
    renderResult(analysis.data);
  } else if (analysis.status === "error") {
    showError(analysis.error);
  }
});

// --- background.js에서 실시간 메시지 수신 ---

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "analysis-loading") {
    showLoading(message.text);
  }

  if (message.action === "analysis-result") {
    renderResult(message.data);
  }

  if (message.action === "analysis-error") {
    showError(message.error);
  }
});

// --- 렌더링 함수들 ---

function clearContent() {
  while (contentEl.firstChild) {
    contentEl.firstChild.remove();
  }
}

function showEmpty() {
  clearContent();
  headerEl.style.display = "none";

  // 히어로 영역
  const hero = document.createElement("div");
  hero.classList.add("ai-translator-sidebar-hero");

  const heroTitle = document.createElement("div");
  heroTitle.classList.add("ai-translator-sidebar-hero-title");
  heroTitle.textContent = "AI 문장 번역기";

  const subtitle = document.createElement("div");
  subtitle.classList.add("ai-translator-sidebar-subtitle");
  subtitle.textContent = "영어·일본어 문장을 분석하고 번역합니다";

  hero.appendChild(heroTitle);
  hero.appendChild(subtitle);
  contentEl.appendChild(hero);

  // 이용방법 가이드
  const guide = document.createElement("div");
  guide.classList.add("ai-translator-sidebar-guide");

  const guideTitle = document.createElement("div");
  guideTitle.classList.add("ai-translator-sidebar-guide-title");
  guideTitle.textContent = "이용방법";

  guide.appendChild(guideTitle);

  const guideItems = [
    { icon: "\uD83D\uDCDD", title: "번역하기", desc: "텍스트 드래그 → 우클릭 → \"AI로 번역하기\"" },
    { icon: "\uD83D\uDD0D", title: "문장 파헤치기", desc: "텍스트 드래그 → 우클릭 → \"AI 문장 파헤치기\"" },
    { icon: "⌨", title: "단축키", desc: "Ctrl+Shift+Y로 빠른 번역" },
  ];

  guideItems.forEach((item) => {
    const itemEl = document.createElement("div");
    itemEl.classList.add("ai-translator-sidebar-guide-item");

    const titleEl = document.createElement("div");
    titleEl.classList.add("ai-translator-sidebar-guide-item-title");
    titleEl.textContent = item.icon + " " + item.title;

    const descEl = document.createElement("div");
    descEl.classList.add("ai-translator-sidebar-guide-item-desc");
    descEl.textContent = item.desc;

    itemEl.appendChild(titleEl);
    itemEl.appendChild(descEl);
    guide.appendChild(itemEl);
  });

  contentEl.appendChild(guide);

  // API 키 설정 영역
  const settings = document.createElement("div");
  settings.classList.add("ai-translator-sidebar-settings");

  const title = document.createElement("div");
  title.classList.add("ai-translator-sidebar-settings-title");
  title.textContent = "API 설정";

  const label = document.createElement("label");
  label.textContent = "Claude API 키";
  label.setAttribute("for", "sidebar-api-key");

  const input = document.createElement("input");
  input.type = "password";
  input.id = "sidebar-api-key";
  input.placeholder = "sk-ant-...";

  const saveBtn = document.createElement("button");
  saveBtn.classList.add("ai-translator-sidebar-save-btn");
  saveBtn.textContent = "저장";

  const status = document.createElement("div");
  status.classList.add("ai-translator-sidebar-status");

  settings.appendChild(title);
  settings.appendChild(label);
  settings.appendChild(input);
  settings.appendChild(saveBtn);
  settings.appendChild(status);
  contentEl.appendChild(settings);

  // 저장된 키 로드
  browser.storage.local.get("claudeApiKey").then((result) => {
    if (result.claudeApiKey) {
      const key = result.claudeApiKey;
      input.value = key.slice(0, 7) + "..." + key.slice(-4);
      input.dataset.saved = "true";
      status.textContent = "API 키가 저장되어 있습니다.";
      status.className = "ai-translator-sidebar-status ai-translator-sidebar-status-info";
    }
  });

  // 포커스 시 마스킹 해제
  input.addEventListener("focus", () => {
    if (input.dataset.saved === "true") {
      input.value = "";
      input.dataset.saved = "false";
    }
  });

  // 저장
  saveBtn.addEventListener("click", () => {
    const key = input.value.trim();

    if (!key || input.dataset.saved === "true") {
      status.textContent = "새 API 키를 입력해주세요.";
      status.className = "ai-translator-sidebar-status ai-translator-sidebar-status-info";
      return;
    }

    browser.storage.local.set({ claudeApiKey: key }).then(() => {
      input.value = key.slice(0, 7) + "..." + key.slice(-4);
      input.dataset.saved = "true";
      status.textContent = "저장되었습니다!";
      status.className = "ai-translator-sidebar-status ai-translator-sidebar-status-success";
    });
  });
}

function showLoading(text) {
  clearContent();
  headerEl.style.display = "";

  const wrapper = document.createElement("div");
  wrapper.classList.add("ai-translator-sidebar-loading");

  const spinner = document.createElement("div");
  spinner.classList.add("ai-translator-sidebar-spinner");

  const label = document.createElement("div");
  label.textContent = "분석 중...";

  wrapper.appendChild(spinner);
  wrapper.appendChild(label);
  contentEl.appendChild(wrapper);

  if (text) {
    const original = document.createElement("div");
    original.classList.add("ai-translator-sidebar-original");
    original.textContent = text;
    contentEl.appendChild(original);
  }
}

function showError(error) {
  clearContent();
  headerEl.style.display = "";
  const div = document.createElement("div");
  div.classList.add("ai-translator-sidebar-error");
  div.textContent = error;
  contentEl.appendChild(div);
}

function renderResult(data) {
  clearContent();
  headerEl.style.display = "";

  if (data.type === "single") {
    // multiAnalysisData가 있으면 개별 파헤치기에서 돌아온 것이므로 뒤로가기 버튼 표시
    renderSingleAnalysis(data, !!multiAnalysisData);
  } else if (data.type === "multi") {
    multiAnalysisData = data;
    renderMultiAnalysis(data);
  }
}

// --- 단일 문장 분석 렌더링 ---

function renderSingleAnalysis(data, showBackButton) {
  clearContent();

  // 뒤로가기 버튼 (여러 문장에서 개별 파헤치기 후)
  if (showBackButton && multiAnalysisData) {
    const backBtn = document.createElement("button");
    backBtn.classList.add("ai-translator-sidebar-back-btn");
    backBtn.textContent = "← 전체 문장 목록";
    backBtn.addEventListener("click", () => {
      renderMultiAnalysis(multiAnalysisData);
    });
    contentEl.appendChild(backBtn);
  }

  // 원문
  const original = document.createElement("div");
  original.classList.add("ai-translator-sidebar-original");
  original.textContent = data.original;
  contentEl.appendChild(original);

  // 번역
  const translation = document.createElement("div");
  translation.classList.add("ai-translator-sidebar-translation");
  translation.textContent = data.translation;
  contentEl.appendChild(translation);

  // 문장 구조
  if (data.structure && data.structure.length > 0) {
    const section = createSection("문장 구조");

    data.structure.forEach((item) => {
      const row = document.createElement("div");
      row.classList.add("ai-translator-sidebar-structure-item");

      const role = document.createElement("span");
      role.classList.add("ai-translator-sidebar-role");
      role.textContent = item.role;

      const textWrapper = document.createElement("div");
      textWrapper.classList.add("ai-translator-sidebar-structure-text");

      const text = document.createElement("div");
      text.textContent = item.text;

      const meaning = document.createElement("div");
      meaning.classList.add("ai-translator-sidebar-structure-meaning");
      meaning.textContent = item.meaning;

      textWrapper.appendChild(text);
      textWrapper.appendChild(meaning);
      row.appendChild(role);
      row.appendChild(textWrapper);
      section.appendChild(row);
    });

    contentEl.appendChild(section);
  }

  // 직독직해
  if (data.chunk_translation && data.chunk_translation.length > 0) {
    const section = createSection("직독직해");

    data.chunk_translation.forEach((item) => {
      const row = document.createElement("div");
      row.classList.add("ai-translator-sidebar-chunk-item");

      const chunk = document.createElement("span");
      chunk.classList.add("ai-translator-sidebar-chunk-text");
      chunk.textContent = item.chunk;

      const meaning = document.createElement("span");
      meaning.classList.add("ai-translator-sidebar-chunk-meaning");
      meaning.textContent = item.meaning;

      row.appendChild(chunk);
      row.appendChild(meaning);
      section.appendChild(row);
    });

    contentEl.appendChild(section);
  }

  // 문법 노트
  if (data.grammar_notes && data.grammar_notes.length > 0) {
    const section = createSection("알아두면 좋은 문법");

    data.grammar_notes.forEach((item) => {
      const card = document.createElement("div");
      card.classList.add("ai-translator-sidebar-grammar-item");

      const point = document.createElement("div");
      point.classList.add("ai-translator-sidebar-grammar-point");
      point.textContent = item.point;

      const explanation = document.createElement("div");
      explanation.classList.add("ai-translator-sidebar-grammar-explanation");
      explanation.textContent = item.explanation;

      card.appendChild(point);
      card.appendChild(explanation);
      section.appendChild(card);
    });

    contentEl.appendChild(section);
  }

  // 한자 노트 (일본어인 경우에만)
  if (data.kanji_notes && data.kanji_notes.length > 0) {
    const section = createSection("알아두면 좋은 한자");

    data.kanji_notes.forEach((item) => {
      const card = document.createElement("div");
      card.classList.add("ai-translator-sidebar-kanji-item");

      const kanji = document.createElement("span");
      kanji.classList.add("ai-translator-sidebar-kanji-text");
      kanji.textContent = item.kanji;

      const reading = document.createElement("span");
      reading.classList.add("ai-translator-sidebar-kanji-reading");
      reading.textContent = item.reading;

      const meaning = document.createElement("span");
      meaning.classList.add("ai-translator-sidebar-kanji-meaning");
      meaning.textContent = item.meaning;

      card.appendChild(kanji);
      card.appendChild(reading);
      card.appendChild(meaning);
      section.appendChild(card);
    });

    contentEl.appendChild(section);
  }
}

// --- 여러 문장 분석 렌더링 ---

function renderMultiAnalysis(data) {
  clearContent();

  data.sentences.forEach((sentence) => {
    const card = document.createElement("div");
    card.classList.add("ai-translator-sidebar-sentence-card");

    // 원문
    const original = document.createElement("div");
    original.classList.add("ai-translator-sidebar-sentence-original");
    original.textContent = sentence.original;

    // 번역
    const translation = document.createElement("div");
    translation.classList.add("ai-translator-sidebar-sentence-translation");
    translation.textContent = sentence.translation;

    card.appendChild(original);
    card.appendChild(translation);

    // 직독직해
    if (sentence.chunk_translation && sentence.chunk_translation.length > 0) {
      const chunkSection = createSection("직독직해");

      sentence.chunk_translation.forEach((item) => {
        const row = document.createElement("div");
        row.classList.add("ai-translator-sidebar-chunk-item");

        const chunk = document.createElement("span");
        chunk.classList.add("ai-translator-sidebar-chunk-text");
        chunk.textContent = item.chunk;

        const meaning = document.createElement("span");
        meaning.classList.add("ai-translator-sidebar-chunk-meaning");
        meaning.textContent = item.meaning;

        row.appendChild(chunk);
        row.appendChild(meaning);
        chunkSection.appendChild(row);
      });

      card.appendChild(chunkSection);
    }

    // 파헤치기 버튼
    const btn = document.createElement("button");
    btn.classList.add("ai-translator-sidebar-analyze-btn");
    btn.textContent = "파헤치기";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.textContent = "분석 중...";

      // background.js에 단일 문장 분석 요청
      browser.runtime.sendMessage({
        action: "analyze-single",
        text: sentence.original,
      });

      // 로딩 표시
      showLoading(sentence.original);
    });

    card.appendChild(btn);
    contentEl.appendChild(card);
  });
}

// --- 헬퍼 ---

function createSection(title) {
  const section = document.createElement("div");
  section.classList.add("ai-translator-sidebar-section");

  const titleEl = document.createElement("div");
  titleEl.classList.add("ai-translator-sidebar-section-title");
  titleEl.textContent = title;

  section.appendChild(titleEl);
  return section;
}
