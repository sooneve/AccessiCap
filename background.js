// AccessiCap - Background Service Worker

// ============================================================
// SERVER URL — change as needed
// ============================================================
// For local development:
const SERVER_URL = 'http://127.0.0.1:8001';
// For Cloud Run deployment, swap to:
// const SERVER_URL = 'https://accessicap-api-48829507981.us-central1.run.app';

// Default settings
const DEFAULT_SETTINGS = {
  language: 'en',
  autoCaption: true,
  enableTts: true,
  ttsRate: 1.0,
  ttsPitch: 1.0,
  ttsVolume: 1.0,
  highContrast: false,
  dyslexiaFont: false,
  boldText: false,
  largeCaptions: true,
  colorblindMode: 'none',
  readingGuide: false,
  highlightProcessed: true,
  autoSpeak: false
};


let sessionStats = {
  imagesProcessed: 0,
  ttsUsed: 0
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('AccessiCap installed/updated');

  chrome.storage.sync.get(null, (data) => {
    const newSettings = { ...DEFAULT_SETTINGS, ...data };
    chrome.storage.sync.set(newSettings);
  });

  setupContextMenus();
});

function setupContextMenus() {
  console.log('Setting up context menus...');

  chrome.contextMenus.removeAll(() => {
    // Check for any errors
    if (chrome.runtime.lastError) {
      console.log('Error removing menus:', chrome.runtime.lastError.message);
    }

    chrome.contextMenus.create({
      id: "ac-describe-image",
      title: "🖼️ Describe This Image",
      contexts: ["image"]
    });

    chrome.contextMenus.create({
      id: "ac-read-selection",
      title: "🔊 Read Selected Text",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      id: "ac-read-page",
      title: "📖 Read Entire Page",
      contexts: ["page"]
    });

    chrome.contextMenus.create({
      id: "ac-stop-speaking",
      title: "⏹️ Stop Speaking",
      contexts: ["all"]
    });

    chrome.contextMenus.create({
      id: "ac-separator-1",
      type: "separator",
      contexts: ["all"]
    });

    chrome.contextMenus.create({
      id: "ac-scan-page",
      title: "🔍 Scan Page for Images",
      contexts: ["page"]
    });

    console.log('Context menus created successfully');
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('Context menu clicked:', info.menuItemId);

  switch (info.menuItemId) {
    case "ac-describe-image":
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: "describeImage",
          imageUrl: info.srcUrl
        }).catch(error => {
          console.log('Could not send message to tab:', error);
        });
      }
      break;

    case "ac-read-selection":
      if (info.selectionText) {
        speakText(info.selectionText);
      }
      break;

    case "ac-read-page":
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "getPageText" })
          .then(response => {
            if (response && response.text) {
              speakText(response.text);
            }
          })
          .catch(error => {
            console.log('Could not read page:', error);
          });
      }
      break;

    case "ac-stop-speaking":
      chrome.tts.stop();
      break;

    case "ac-scan-page":
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "scanPage" }).catch(error => {
          console.log('Could not scan page:', error);
        });
      }
      break;
  }
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      switch (command) {
        case "scan-page":
          chrome.tabs.sendMessage(tabs[0].id, { action: "scanPage" }).catch(() => { });
          break;
        case "read-selection":
          chrome.tabs.sendMessage(tabs[0].id, { action: "readSelection" }).catch(() => { });
          break;
      }
    }
  });
});

function analyzeImage(imageData, language) {
  return new Promise((resolve, reject) => {
    fetch(`${SERVER_URL}/caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageData: imageData,
        language: language || 'en'
      })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Server error: ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        resolve(data);
      })
      .catch(error => {
        console.error('API Error:', error);
        resolve({
          caption: "Unable to analyze image - server may be offline",
          language: language || 'en',
          error: true
        });
      });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received:', request.action);

  switch (request.action) {
    case "analyzeImage":
      analyzeImage(request.imageData, request.language)
        .then(result => {
          sessionStats.imagesProcessed++;
          updateBadge();
          sendResponse(result);
        })
        .catch(error => {
          console.error('Analysis error:', error);
          sendResponse({
            caption: "Unable to analyze image",
            error: true
          });
        });
      return true;

    case "speak":
      speakText(request.text, request.lang, request.rate, request.pitch, request.volume);
      sessionStats.ttsUsed++;
      sendResponse({ success: true });
      break;

    case "stopSpeaking":
      chrome.tts.stop();
      sendResponse({ success: true });
      break;

    case "getStats":
      sendResponse(sessionStats);
      break;

    case "checkServerStatus":
      checkServerStatus()
        .then(status => sendResponse({ online: status }))
        .catch(() => sendResponse({ online: false }));
      return true;

    case "getVoices":
      chrome.tts.getVoices((voices) => {
        sendResponse({ voices: voices });
      });
      return true;

    case "scanCurrentTab":
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "scanPage" })
            .then(response => sendResponse(response))
            .catch(() => sendResponse({ success: false }));
        }
      });
      return true;

    case "getSettings":
      chrome.storage.sync.get(null, (settings) => {
        sendResponse({ success: true, settings });
      });
      return true;

    case "fetchImageData":
      fetchImageAsBase64(request.imageUrl)
        .then((dataUrl) => sendResponse({ dataUrl }))
        .catch((error) => {
          console.error('Image fetch error:', error);
          sendResponse({ dataUrl: null, error: true });
        });
      return true;
  }
});

function speakText(text, lang, rate, pitch, volume) {
  // Stop any ongoing speech
  chrome.tts.stop();

  chrome.storage.sync.get(['ttsRate', 'ttsPitch', 'ttsVolume', 'language'], (settings) => {
    const speechLang = lang || settings.language || 'en';
    const speechRate = rate || settings.ttsRate || 1.0;
    const speechPitch = pitch || settings.ttsPitch || 1.0;
    const speechVolume = volume || settings.ttsVolume || 1.0;

    console.log(`TTS: Speaking in lang='${speechLang}', text='${text.substring(0, 50)}...'`);

    // --- Use Web Speech API for proper multi-language support ---
    // chrome.tts requires OS-installed voices; Web Speech API uses Google's
    // online engine which natively handles Hindi, Nepali, French, etc.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'webSpeakText',
          text: text,
          lang: speechLang,
          rate: speechRate,
          pitch: speechPitch,
          volume: speechVolume
        }).catch(() => {
          // Fallback to chrome.tts if content script not available
          chrome.tts.speak(text, {
            lang: speechLang,
            rate: speechRate,
            pitch: speechPitch,
            volume: speechVolume,
            onEvent: (e) => { if (e.type === 'error') console.error('TTS fallback error:', e.errorMessage); }
          });
        });
      }
    });
  });
}

function checkServerStatus() {
  return new Promise((resolve) => {
    fetch(`${SERVER_URL}/health`, { method: 'GET' })
      .then(response => resolve(response.ok))
      .catch(() => resolve(false));
  });
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const data = await response.json();
    return data.models_loaded === true;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

function updateBadge() {
  if (sessionStats.imagesProcessed > 0) {
    chrome.action.setBadgeText({
      text: String(sessionStats.imagesProcessed)
    });
    chrome.action.setBadgeBackgroundColor({
      color: '#667eea'
    });
  }
}

chrome.tabs.onActivated.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
});

async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl) {
    throw new Error('Missing image URL');
  }

  const response = await fetch(imageUrl, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = await response.arrayBuffer();
  const base64Data = arrayBufferToBase64(buffer);
  return `data:${contentType};base64,${base64Data}`;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}