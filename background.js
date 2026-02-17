const TELEGRAPH_API = 'https://api.telegra.ph';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'CREATE_TELEGRAPH_SUMMARY') {
    return;
  }

  handleCreateSummary(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function handleCreateSummary({ tabId, shortName }) {
  const [injectionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractPageData
  });

  const pageInfo = injectionResult?.result;

  if (pageInfo?.error) {
    throw new Error(pageInfo.error);
  }

  if (!pageInfo?.title || !pageInfo?.url) {
    throw new Error('Не удалось получить контент страницы.');
  }

  const accessToken = await getOrCreateTelegraphToken(shortName);
  const content = buildTelegraphContent(pageInfo);

  const createPayload = new URLSearchParams({
    access_token: accessToken,
    title: trim(pageInfo.title, 120),
    content: JSON.stringify(content),
    author_name: 'Chrome Summary Extension',
    return_content: 'false'
  });

  const createRes = await fetch(`${TELEGRAPH_API}/createPage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: createPayload
  });

  const createData = await createRes.json();
  if (!createData?.ok) {
    throw new Error(createData?.error || 'Ошибка создания страницы в Telegraph.');
  }

  return { url: createData.result.url };
}

async function getOrCreateTelegraphToken(shortName) {
  const key = `telegraphToken:${shortName}`;
  const storageData = await chrome.storage.local.get([key]);
  if (storageData[key]) {
    return storageData[key];
  }

  const accountPayload = new URLSearchParams({
    short_name: shortName,
    author_name: 'Chrome Summary Extension'
  });

  const accountRes = await fetch(`${TELEGRAPH_API}/createAccount`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body: accountPayload
  });

  const accountData = await accountRes.json();
  if (!accountData?.ok || !accountData?.result?.access_token) {
    throw new Error(accountData?.error || 'Не удалось создать Telegraph-аккаунт.');
  }

  const token = accountData.result.access_token;
  await chrome.storage.local.set({ [key]: token });
  return token;
}

function buildTelegraphContent(pageInfo) {
  return [
    { tag: 'h3', children: ['Краткое summary'] },
    { tag: 'p', children: [pageInfo.summary] },
    { tag: 'h4', children: ['Источник'] },
    {
      tag: 'p',
      children: [
        {
          tag: 'a',
          attrs: {
            href: pageInfo.url
          },
          children: [pageInfo.url]
        }
      ]
    }
  ];
}

function trim(value, max) {
  if (!value) {
    return '';
  }

  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function extractPageData() {
  try {
    const trimLocal = (value, max) => {
      if (!value) {
        return '';
      }

      return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
    };

    const makeSummaryLocal = (text) => {
      if (!text) {
        return 'На странице не удалось извлечь достаточный текст для summary.';
      }

      const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

      const picked = [];
      let size = 0;

      for (const sentence of sentences) {
        if (sentence.length < 30) {
          continue;
        }

        picked.push(sentence);
        size += sentence.length;

        if (picked.length >= 4 || size >= 700) {
          break;
        }
      }

      if (picked.length === 0) {
        return trimLocal(text, 700);
      }

      return trimLocal(picked.join(' '), 700);
    };

    const title = document.title?.trim() || 'Без заголовка';
    const url = window.location.href;

    const blocks = Array.from(document.querySelectorAll('article p, main p, p'))
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')
      .filter(Boolean)
      .filter((text) => text.length > 50);

    const fallbackText = document.body?.innerText?.replace(/\s+/g, ' ').trim() || '';

    const sourceText = blocks.length > 0 ? blocks.join(' ') : fallbackText;
    const summary = makeSummaryLocal(sourceText);

    return { title, url, summary };
  } catch (error) {
    return { error: `Ошибка извлечения данных страницы: ${error.message}` };
  }
}
