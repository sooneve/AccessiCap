// AccessiCap - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  console.log('AccessiCap popup loaded');

  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const imagesProcessed = document.getElementById('imagesProcessed');
  const ttsUsed = document.getElementById('ttsUsed');
  const languageSelect = document.getElementById('language');
  const autoCaptionToggle = document.getElementById('autoCaption');
  const enableTtsToggle = document.getElementById('enableTts');
  const highContrastToggle = document.getElementById('highContrast');
  const dyslexiaFontToggle = document.getElementById('dyslexiaFont');
  const boldTextToggle = document.getElementById('boldText');
  const readingGuideToggle = document.getElementById('readingGuide');
  const largeCaptionsToggle = document.getElementById('largeCaptions');
  const colorblindModeSelect = document.getElementById('colorblindMode');
  const scanBtn = document.getElementById('scanBtn');
  const testTtsBtn = document.getElementById('testTtsBtn');
  const readAllBtn = document.getElementById('readAllBtn');
  const stopTtsBtn = document.getElementById('stopTtsBtn');
  const optionsLink = document.getElementById('optionsLink');
  const toast = document.getElementById('toast');

  function updateElement(element, property, value) {
    if (element && element[property] !== undefined) {
      element[property] = value;
    }
  }

  function toggleClass(element, className, shouldAdd) {
    if (element && element.classList) {
      if (shouldAdd) {
        element.classList.add(className);
      } else {
        element.classList.remove(className);
      }
    }
  }

  await loadSettings();

  checkServerStatus();

  loadStats();

  languageSelect.addEventListener('change', () => {
    saveSettings();
  });

  autoCaptionToggle.addEventListener('change', saveSettings);
  enableTtsToggle.addEventListener('change', saveSettings);
  highContrastToggle.addEventListener('change', saveSettings);
  dyslexiaFontToggle.addEventListener('change', saveSettings);
  boldTextToggle.addEventListener('change', saveSettings);
  readingGuideToggle.addEventListener('change', saveSettings);
  largeCaptionsToggle.addEventListener('change', saveSettings);
  colorblindModeSelect.addEventListener('change', saveSettings);

  scanBtn.addEventListener('click', async () => {
    updateElement(scanBtn, 'disabled', true);
    scanBtn.innerHTML = '<span class="loading"></span> Scanning...';

    try {
      const response = await chrome.runtime.sendMessage({ action: 'scanCurrentTab' });
      showToast('✅ Scan started!');
    } catch (error) {
      console.error('Scan error:', error);
      showToast('❌ Error scanning page');
    }

    setTimeout(() => {
      updateElement(scanBtn, 'disabled', false);
      scanBtn.innerHTML = '🔍 Scan Page for Images';
    }, 2000);
  });

  testTtsBtn.addEventListener('click', () => {
    const testMessages = {
      'en': 'Hello! AccessiCap text-to-speech is working correctly.',
      'hi': 'नमस्ते! AccessiCap text-to-speech काम कर रहा है।',
      'ne': 'नमस्ते! AccessiCap text-to-speech काम गर्दैछ।',
      'es': '¡Hola! El texto a voz de AccessiCap funciona correctamente.',
      'fr': 'Bonjour! Le texte-parole AccessiCap funciona correctamente.',
      'de': 'Hallo! AccessiCap Text-zu-Sprache funktioniert korrekt.',
      'zh': '你好！AccessiCap 文字转语音功能正常。',
      'ja': 'こんにちは！AccessiCapのテキスト読み上げは正常に動作しています。',
      'ko': '안녕하세요! AccessiCap 텍스트 음성 변환이 작동하고 있습니다。',
      'ar': 'مرحبا! AccessiCap تحويل النص إلى كلام يعمل بشكل صحيح.',
      'ru': 'Привет! AccessiCap работает правильно.',
      'pt': 'Olá! O texto para fala do AccessiCap está funcionando.'
    };

    const lang = languageSelect.value;
    const message = testMessages[lang] || testMessages['en'];

    chrome.runtime.sendMessage({
      action: 'speak',
      text: message,
      lang: lang
    });

    showToast('🔊 Speaking...');
  });

  readAllBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { action: 'readAllAltTexts' });
        showToast('📖 Reading all image descriptions...');
      }
    } catch (error) {
      console.error('Error reading alt texts:', error);
      showToast('❌ Error reading alt texts');
    }
  });

  stopTtsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'stopSpeaking' });
    showToast('⏹️ Stopped');
  });

  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'language',
        'autoCaption',
        'enableTts',
        'highContrast',
        'dyslexiaFont',
        'boldText',
        'readingGuide',
        'largeCaptions',
        'colorblindMode'
      ], (data) => {
        updateElement(languageSelect, 'value', data.language || 'en');
        updateElement(autoCaptionToggle, 'checked', data.autoCaption !== false);
        updateElement(enableTtsToggle, 'checked', data.enableTts !== false);
        updateElement(highContrastToggle, 'checked', !!data.highContrast);
        updateElement(dyslexiaFontToggle, 'checked', !!data.dyslexiaFont);
        updateElement(boldTextToggle, 'checked', !!data.boldText);
        updateElement(readingGuideToggle, 'checked', !!data.readingGuide);
        updateElement(largeCaptionsToggle, 'checked', data.largeCaptions !== false);
        updateElement(colorblindModeSelect, 'value', data.colorblindMode || 'none');
        resolve();
      });
    });
  }

  function saveSettings() {
    const settings = {
      language: languageSelect.value,
      autoCaption: autoCaptionToggle.checked,
      enableTts: enableTtsToggle.checked,
      highContrast: highContrastToggle.checked,
      dyslexiaFont: dyslexiaFontToggle.checked,
      boldText: boldTextToggle.checked,
      readingGuide: readingGuideToggle.checked,
      largeCaptions: largeCaptionsToggle.checked,
      colorblindMode: colorblindModeSelect.value
    };

    chrome.storage.sync.set(settings, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'settingsUpdated',
            settings: settings
          }).catch(() => {
          });
        }
      });

      showToast('✅ Settings saved!');
    });
  }

  async function checkServerStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'checkServerStatus' });
      if (response && response.online) {
        toggleClass(statusDot, 'offline', false);
        toggleClass(statusDot, 'online', true);
        updateElement(statusText, 'textContent', 'Online');
        statusText.style.color = '#27ae60';
      } else {
        setOfflineStatus();
      }
    } catch (error) {
      console.error('Server status error:', error);
      setOfflineStatus();
    }
  }

  function setOfflineStatus() {
    toggleClass(statusDot, 'online', false);
    toggleClass(statusDot, 'offline', true);
    updateElement(statusText, 'textContent', 'Offline');
    statusText.style.color = '#e74c3c';
  }

  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStats' });
      if (response) {
        updateElement(imagesProcessed, 'textContent', response.imagesProcessed || 0);
        updateElement(ttsUsed, 'textContent', response.ttsUsed || 0);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  function showToast(message) {
    if (!toast) return;

    updateElement(toast, 'textContent', message);
    toggleClass(toast, 'show', true);

    setTimeout(() => {
      toggleClass(toast, 'show', false);
    }, 2500);
  }
});