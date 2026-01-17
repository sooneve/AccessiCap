// AccessiCap - Background Service Worker
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
    fetch('http://127.0.0.1:8001/caption', {
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
  }
});

function speakText(text, lang, rate, pitch, volume) {
  chrome.tts.stop();

  chrome.storage.sync.get(['ttsRate', 'ttsPitch', 'ttsVolume', 'language'], (settings) => {
    const options = {
      lang: lang || settings.language || 'en',
      rate: rate || settings.ttsRate || 1.0,
      pitch: pitch || settings.ttsPitch || 1.0,
      volume: volume || settings.ttsVolume || 1.0
    };

    chrome.tts.speak(text, options, () => {
      if (chrome.runtime.lastError) {
        console.error('TTS Error:', chrome.runtime.lastError.message);
      }
    });
  });
}

function checkServerStatus() {
  return new Promise((resolve) => {
    fetch('http://127.0.0.1:8001/health', { method: 'GET' })
      .then(response => resolve(response.ok))
      .catch(() => resolve(false));
  });
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