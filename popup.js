const sendBtn = document.getElementById('sendBtn');
const statusEl = document.getElementById('status');
const shortNameInput = document.getElementById('shortName');

function setStatus(message, isError = false) {
  statusEl.className = isError ? 'error' : 'ok';
  statusEl.innerHTML = message;
}

async function init() {
  const { telegraphShortName } = await chrome.storage.local.get(['telegraphShortName']);
  if (telegraphShortName) {
    shortNameInput.value = telegraphShortName;
  }
}

sendBtn.addEventListener('click', async () => {
  sendBtn.disabled = true;
  setStatus('Собираю страницу и отправляю в Telegraph...');

  try {
    const shortName = shortNameInput.value.trim() || 'chrome-summary-bot';
    await chrome.storage.local.set({ telegraphShortName: shortName });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('Не удалось определить активную вкладку.');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_TELEGRAPH_SUMMARY',
      tabId: tab.id,
      shortName
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Неизвестная ошибка.');
    }

    setStatus(
      `Готово! <a href="${response.url}" target="_blank" rel="noopener noreferrer">Открыть telegra.ph</a>`
    );
  } catch (error) {
    setStatus(`Ошибка: ${error.message}`, true);
  } finally {
    sendBtn.disabled = false;
  }
});

init();
