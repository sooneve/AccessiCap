// AccessiCap - Content Script

(function () {
  'use strict';

  let settings = {
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

  const processedImages = new Set();
  let readingGuideElement = null;

  init();

  function init() {
    injectColorblindFilters();

    chrome.storage.sync.get(null, (data) => {
      settings = { ...settings, ...data };
      applyAccessibilitySettings();

      if (settings.autoCaption) {
        setTimeout(scanImages, 1500);
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        for (let key in changes) {
          settings[key] = changes[key].newValue;
        }
        applyAccessibilitySettings();
      }
    });

    chrome.runtime.onMessage.addListener(handleMessage);

    setupMutationObserver();

    console.log('AccessiCap content script initialized');
  }

  function injectColorblindFilters() {
    if (document.getElementById('ac-colorblind-filters')) return;

    const svgFilters = `
      <svg id="ac-colorblind-filters" style="display: none; position: absolute; width: 0; height: 0;">
        <defs>
          <filter id="protanopia-filter">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="deuteranopia-filter">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/>
          </filter>
          <filter id="tritanopia-filter">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0"/>
          </filter>
        </defs>
      </svg>
    `;

    const container = document.createElement('div');
    container.innerHTML = svgFilters;
    if (document.body) {
      document.body.insertBefore(container.firstChild, document.body.firstChild);
    }
  }

  function handleMessage(request, sender, sendResponse) {
    console.log('Content script received:', request.action);

    switch (request.action) {
      case 'scanPage':
        scanImages(true);
        sendResponse({ success: true, message: 'Scanning started' });
        break;

      case 'describeImage':
        const img = document.querySelector(`img[src="${request.imageUrl}"]`);
        if (img) {
          processImage(img, true);
        }
        sendResponse({ success: true });
        break;

      case 'getPageText':
        const text = getPageText();
        sendResponse({ text: text });
        break;

      case 'readSelection':
        const selection = window.getSelection().toString().trim();
        if (selection) {
          speakText(selection);
        }
        sendResponse({ success: true });
        break;

      case 'settingsUpdated':
        settings = { ...settings, ...request.settings };
        applyAccessibilitySettings();
        sendResponse({ success: true });
        break;

      case 'getProcessedCount':
        sendResponse({ count: processedImages.size });
        break;

      case 'readAllAltTexts':
        readAllAltTexts();
        sendResponse({ success: true });
        break;

      case 'webSpeakText':
        webSpeechSpeak(request.text, request.lang, request.rate, request.pitch, request.volume);
        sendResponse({ success: true });
        break;

      case 'stopSpeaking':
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        sendResponse({ success: true });
        break;
    }

    return true;
  }

  function readAllAltTexts() {
    const images = document.querySelectorAll('img[alt]');
    let altTexts = [];

    images.forEach((img) => {
      if (img.alt && img.alt.length > 5) {
        altTexts.push(img.alt);
      }
    });

    if (altTexts.length > 0) {
      const combinedText = "Image descriptions: " + altTexts.join(". Next: ");
      speakText(combinedText);
      showToast(`🔊 Reading ${altTexts.length} descriptions...`);
    } else {
      showToast('No descriptions found. Scan the page first.');
    }
  }

  function applyAccessibilitySettings() {
    const body = document.body;
    if (!body) return;

    body.classList.toggle('ac-high-contrast', !!settings.highContrast);

    body.classList.toggle('ac-dyslexia-font', !!settings.dyslexiaFont);

    body.classList.toggle('ac-bold-text', !!settings.boldText);

    body.classList.toggle('ac-large-captions', !!settings.largeCaptions);

    body.classList.remove(
      'ac-colorblind-protanopia',
      'ac-colorblind-deuteranopia',
      'ac-colorblind-tritanopia',
      'ac-colorblind-achromatopsia',
      'ac-colorblind-enhanced'
    );

    if (settings.colorblindMode && settings.colorblindMode !== 'none') {
      body.classList.add(`ac-colorblind-${settings.colorblindMode}`);
    }

    if (settings.readingGuide) {
      setupReadingGuide();
    } else {
      removeReadingGuide();
    }
  }

  function setupMutationObserver() {
    let debounceTimer;
    const observer = new MutationObserver((mutations) => {
      if (!settings.autoCaption) return;

      let hasNewImages = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeName === 'IMG') {
            hasNewImages = true;
          } else if (node.querySelectorAll) {
            if (node.querySelectorAll('img').length > 0) {
              hasNewImages = true;
            }
          }
        });
      });

      if (hasNewImages) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => scanImages(), 800);
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function scanImages(force = false) {
    const images = document.querySelectorAll('img');
    let toProcess = [];

    images.forEach((img) => {
      if (processedImages.has(img.src) && !force) return;

      if (img.naturalWidth < 50 || img.naturalHeight < 50) return;
      if (img.width < 50 || img.height < 50) return;

      if (!force && img.alt && img.alt.length > 10 && !img.alt.startsWith('AI:')) return;

      if (!isVisible(img)) return;

      if (img.src.startsWith('data:') && img.src.length < 100) return;

      toProcess.push(img);
    });

    if (toProcess.length > 0) {
      showToast(`🔍 Scanning ${toProcess.length} images...`);
      toProcess.forEach((img, index) => {
        setTimeout(() => processImage(img), index * 300);
      });
    } else if (force) {
      showToast('✅ No new images to process');
    }
  }

  async function processImage(img, speakResult = false) {
    img.classList.add('ac-processing');
    img.classList.remove('ac-processed', 'ac-error');

    try {
      const imageData = await getImageAsBase64(img);

      if (!imageData) {
        throw new Error('Could not load image');
      }

      const response = await chrome.runtime.sendMessage({
        action: 'analyzeImage',
        imageData: imageData,
        language: settings.language
      });

      if (response && response.caption && response.error !== true) {
        img.alt = response.caption;
        img.title = `AI: ${response.caption}`;

        img.classList.remove('ac-processing');
        if (settings.highlightProcessed) {
          img.classList.add('ac-processed');
        }

        addCaptionTooltip(img, response.caption);

        processedImages.add(img.src);

        if (settings.enableTts) {
          img.style.cursor = 'pointer';
          img.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            speakText(response.caption);
          };
        }

        if (speakResult || settings.autoSpeak) {
          speakText(response.caption);
        }

        console.log('AccessiCap: Processed -', response.caption);
      } else {
        throw new Error('Server offline or image failed');
      }

    } catch (error) {
      console.log('AccessiCap: Skipping image -', error.message);
      img.classList.remove('ac-processing');
    }
  }

  async function getImageAsBase64(img) {
    // If it's already a data URL
    if (img.src.startsWith('data:')) {
      return img.src;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 300;
      canvas.height = img.naturalHeight || img.height || 300;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      console.log('Canvas method failed, trying fetch...');
    }

    try {
      const response = await fetch(img.src, { mode: 'cors' });
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.log('Fetch method failed:', e.message);
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'fetchImageData',
        imageUrl: img.src
      });
      if (response && response.dataUrl) {
        return response.dataUrl;
      }
    } catch (e) {
      console.log('Background fetch failed:', e.message);
    }

    return null;
  }

  function addCaptionTooltip(img, caption) {
    let wrapper = img.parentElement;
    if (!wrapper || !wrapper.classList.contains('ac-image-wrapper')) {
      wrapper = document.createElement('span');
      wrapper.className = 'ac-image-wrapper';
      wrapper.style.cssText = 'position: relative; display: inline-block;';
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);
    }

    const existing = wrapper.querySelector('.ac-caption-tooltip');
    if (existing) existing.remove();

    const tooltip = document.createElement('div');
    tooltip.className = 'ac-caption-tooltip';
    tooltip.textContent = caption;
    wrapper.appendChild(tooltip);
  }

  function speakText(text) {
    if (!settings.enableTts) return;

    chrome.runtime.sendMessage({
      action: 'speak',
      text: text,
      lang: settings.language,
      rate: settings.ttsRate,
      pitch: settings.ttsPitch,
      volume: settings.ttsVolume
    });

    showToast('🔊 Speaking...');
  }

  function webSpeechSpeak(text, lang, rate, pitch, volume) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || 'en';
    utter.rate = rate || 1.0;
    utter.pitch = pitch || 1.0;
    utter.volume = volume || 1.0;

    // Try to find a matching voice; Web Speech API usually auto-selects correctly
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(v => v.lang === lang)
      || voices.find(v => v.lang.startsWith(lang))
      || null;
    if (match) utter.voice = match;

    utter.onerror = (e) => console.error('Web Speech error:', e.error);

    window.speechSynthesis.speak(utter);
  }

  function getPageText() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tag = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }

          if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let text = '';
    let node;
    while (node = walker.nextNode()) {
      const content = node.textContent.trim();
      if (content) {
        text += content + ' ';
      }
    }

    return text.trim().substring(0, 10000);
  }

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.offsetWidth > 0 &&
      element.offsetHeight > 0;
  }

  function setupReadingGuide() {
    if (readingGuideElement) return;

    readingGuideElement = document.createElement('div');
    readingGuideElement.className = 'ac-reading-guide';
    document.body.appendChild(readingGuideElement);

    document.addEventListener('mousemove', updateReadingGuide);
  }

  function updateReadingGuide(e) {
    if (readingGuideElement) {
      readingGuideElement.style.top = (e.clientY - 20) + 'px';
    }
  }

  function removeReadingGuide() {
    if (readingGuideElement) {
      readingGuideElement.remove();
      readingGuideElement = null;
      document.removeEventListener('mousemove', updateReadingGuide);
    }
  }

  function showToast(message, duration = 2500) {
    const existing = document.querySelector('.ac-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'ac-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('ac-toast-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

})();