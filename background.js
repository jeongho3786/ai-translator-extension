// 익스텐션이 설치될 때 컨텍스트 메뉴 생성
browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: "translate-selection",
    title: "AI로 번역하기",
    contexts: ["selection"],
  });
});

// 컨텍스트 메뉴 클릭 시 처리
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection") {
    // content.js에 로딩 표시 메시지 전송
    browser.tabs.sendMessage(tab.id, {
      action: "translate",
      text: info.selectionText,
    });

    // Claude API 호출
    translateWithClaude(info.selectionText, tab.id);
  }
});

// Claude API로 번역 요청
async function translateWithClaude(text, tabId) {
  try {
    // storage에서 API 키 읽기
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
