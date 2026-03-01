// --- 프롬프트 상수 ---

const SINGLE_SENTENCE_PROMPT = `You are a sentence analyzer for Korean learners. You analyze English or Japanese sentences.
Analyze the given sentence and respond in the following JSON format ONLY (no markdown, no code blocks, just raw JSON):

{
  "type": "single",
  "original": "the original sentence",
  "translation": "Korean translation",
  "structure": [
    { "role": "주어", "text": "The cat", "meaning": "그 고양이가" },
    { "role": "동사", "text": "sat", "meaning": "앉았다" }
  ],
  "chunk_translation": [
    { "chunk": "The cat", "meaning": "그 고양이가" },
    { "chunk": "sat on", "meaning": "~위에 앉았다" },
    { "chunk": "the mat", "meaning": "매트 위에" }
  ],
  "grammar_notes": [
    { "point": "문법 포인트", "explanation": "설명" }
  ],
  "kanji_notes": [
    { "kanji": "漢字", "reading": "かんじ", "meaning": "한자" }
  ]
}

Rules:
- The input can be English or Japanese. Detect the language automatically.
- structure: Break the sentence into grammatical roles (주어, 동사, 목적어, 보어, 부사구, etc. for English; 주어, 술어, 목적어, 조사, 부사구, etc. for Japanese)
- chunk_translation: Break into meaningful chunks for 직독직해 (reading in order)
- grammar_notes: Notable grammar points, idioms, or patterns worth learning
- kanji_notes: Only for Japanese input. From the sentence, pick kanji words that are commonly used in daily life and worth knowing. Include their reading (furigana) and Korean meaning. Skip rare or overly basic kanji. Omit this field entirely for English input.
- All Korean text should be natural and educational
- Respond with raw JSON only, no other text`;

const MULTI_SENTENCE_PROMPT = `You are a sentence analyzer for Korean learners. You analyze English or Japanese text.
Analyze the given text (multiple sentences) and respond in the following JSON format ONLY (no markdown, no code blocks, just raw JSON):

{
  "type": "multi",
  "sentences": [
    {
      "original": "first sentence",
      "translation": "Korean translation",
      "chunk_translation": [
        { "chunk": "meaningful chunk", "meaning": "의미" }
      ]
    }
  ]
}

Rules:
- The input can be English or Japanese. Detect the language automatically.
- Split the text into individual sentences
- For each sentence, provide translation and chunk_translation (직독직해)
- chunk_translation: Break into meaningful chunks for reading in order
- All Korean text should be natural and educational
- Respond with raw JSON only, no other text`;

// --- 상태 변수 ---

let latestAnalysis = null;

// --- 헬퍼 함수 ---

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
}

// --- 컨텍스트 메뉴 생성 (기존 메뉴 제거 후 재생성) ---

function createContextMenus() {
  browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({
      id: "translate-selection",
      title: "AI로 번역하기",
      contexts: ["selection"],
    });

    browser.contextMenus.create({
      id: "analyze-selection",
      title: "AI 문장 파헤치기",
      contexts: ["selection"],
    });
  });
}

browser.runtime.onInstalled.addListener(createContextMenus);
createContextMenus();

// --- 컨텍스트 메뉴 클릭 처리 ---

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection") {
    browser.tabs.sendMessage(tab.id, {
      action: "translate",
      text: info.selectionText,
    });

    translateWithAI(info.selectionText, tab.id);
  }

  if (info.menuItemId === "analyze-selection") {
    latestAnalysis = { text: info.selectionText, status: "loading" };

    browser.sidebarAction.open();

    // 사이드바가 이미 열려있는 경우 대비
    browser.runtime.sendMessage({ action: "analysis-loading", text: info.selectionText }).catch(() => {});

    analyzeWithAI(info.selectionText);
  }
});

// --- 단축키 입력 처리 ---

browser.commands.onCommand.addListener((command) => {
  if (command === "translate-selection") {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length === 0) return;
      const tab = tabs[0];

      browser.tabs
        .sendMessage(tab.id, { action: "get-selection" })
        .then((response) => {
          if (!response || !response.text) return;

          browser.tabs.sendMessage(tab.id, {
            action: "translate",
            text: response.text,
          });

          translateWithAI(response.text, tab.id);
        });
    });
  }
});

// --- background.js 내부 메시지 수신 (사이드바 ↔ 백그라운드) ---

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "get-analysis") {
    sendResponse(latestAnalysis);
    return;
  }

  if (message.action === "analyze-single") {
    analyzeWithAI(message.text);
    return;
  }
});

// --- Claude API로 번역 요청 ---

async function translateWithAI(text, tabId) {
  try {
    const result = await browser.storage.local.get("claudeApiKey");
    const apiKey = result.claudeApiKey;

    if (!apiKey) {
      browser.tabs.sendMessage(tabId, {
        action: "translation-error",
        error:
          "API 키가 설정되지 않았습니다. 익스텐션 아이콘을 클릭하여 API 키를 입력해주세요.",
      });
      return;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        system:
          "You are a translator. Translate the given English or Japanese text to Korean. Output only the translated text without any explanation or additional text.",
        messages: [
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = "API 호출 실패: " + response.status;

      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error && errorJson.error.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (e) {
        // JSON 파싱 실패 시 기본 에러 메시지 사용
      }

      browser.tabs.sendMessage(tabId, {
        action: "translation-error",
        error: errorMessage,
      });
      return;
    }

    const data = await response.json();

    if (data.stop_reason === "max_tokens") {
      browser.tabs.sendMessage(tabId, {
        action: "translation-error",
        error: "텍스트가 너무 길어 번역이 잘렸습니다. 더 짧은 텍스트를 선택해주세요.",
      });
      return;
    }

    const translatedText = data.content[0].text;

    browser.tabs.sendMessage(tabId, {
      action: "translation-result",
      translatedText: translatedText,
    });
  } catch (error) {
    browser.tabs.sendMessage(tabId, {
      action: "translation-error",
      error: "번역 중 오류가 발생했습니다: " + error.message,
    });
  }
}

// --- Claude API로 문장 분석 요청 ---

async function analyzeWithAI(text) {
  try {
    const result = await browser.storage.local.get("claudeApiKey");
    const apiKey = result.claudeApiKey;

    if (!apiKey) {
      latestAnalysis = {
        text,
        status: "error",
        error: "API 키가 설정되지 않았습니다. 익스텐션 아이콘을 클릭하여 API 키를 입력해주세요.",
      };
      browser.runtime.sendMessage({ action: "analysis-error", error: latestAnalysis.error }).catch(() => {});
      return;
    }

    const sentences = splitSentences(text);
    const isSingle = sentences.length <= 1;
    const systemPrompt = isSingle ? SINGLE_SENTENCE_PROMPT : MULTI_SENTENCE_PROMPT;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = "API 호출 실패: " + response.status;

      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error && errorJson.error.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (e) {
        // JSON 파싱 실패 시 기본 에러 메시지 사용
      }

      latestAnalysis = { text, status: "error", error: errorMessage };
      browser.runtime.sendMessage({ action: "analysis-error", error: errorMessage }).catch(() => {});
      return;
    }

    const data = await response.json();

    if (data.stop_reason === "max_tokens") {
      const errorMessage = "텍스트가 너무 길어 분석이 잘렸습니다. 더 짧은 텍스트를 선택해주세요.";
      latestAnalysis = { text, status: "error", error: errorMessage };
      browser.runtime.sendMessage({ action: "analysis-error", error: errorMessage }).catch(() => {});
      return;
    }

    const responseText = data.content[0].text;

    let analysisData;
    try {
      analysisData = JSON.parse(responseText);
    } catch (e) {
      // 마크다운 코드블록 내 JSON 추출 시도
      const match = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        analysisData = JSON.parse(match[1].trim());
      } else {
        throw new Error("AI 응답을 파싱할 수 없습니다.");
      }
    }

    latestAnalysis = { text, status: "done", data: analysisData };
    browser.runtime.sendMessage({ action: "analysis-result", data: analysisData }).catch(() => {});
  } catch (error) {
    latestAnalysis = { text, status: "error", error: "분석 중 오류가 발생했습니다: " + error.message };
    browser.runtime.sendMessage({ action: "analysis-error", error: latestAnalysis.error }).catch(() => {});
  }
}
