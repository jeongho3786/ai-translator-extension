const apiKeyInput = document.getElementById("api-key");
const saveBtn = document.getElementById("save-btn");
const statusDiv = document.getElementById("status");

// 저장된 API 키 로드
browser.storage.local.get("claudeApiKey").then((result) => {
  if (result.claudeApiKey) {
    // 마스킹하여 표시: 앞 7자 + ... + 뒤 4자
    const key = result.claudeApiKey;
    const masked = key.slice(0, 7) + "..." + key.slice(-4);
    apiKeyInput.value = masked;
    apiKeyInput.dataset.saved = "true";
    statusDiv.textContent = "API 키가 저장되어 있습니다.";
    statusDiv.className = "status status-info";
  }
});

// 입력 시 saved 상태 해제
apiKeyInput.addEventListener("focus", () => {
  if (apiKeyInput.dataset.saved === "true") {
    apiKeyInput.value = "";
    apiKeyInput.dataset.saved = "false";
  }
});

// 저장 버튼 클릭
saveBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();

  if (!key || apiKeyInput.dataset.saved === "true") {
    statusDiv.textContent = "새 API 키를 입력해주세요.";
    statusDiv.className = "status status-info";
    return;
  }

  browser.storage.local.set({ claudeApiKey: key }).then(() => {
    const masked = key.slice(0, 7) + "..." + key.slice(-4);
    apiKeyInput.value = masked;
    apiKeyInput.dataset.saved = "true";
    statusDiv.textContent = "저장되었습니다!";
    statusDiv.className = "status status-success";
  });
});
