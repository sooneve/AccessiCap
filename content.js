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

  // ── Magnifier state ──────────────────────────────────────────
  const MAGNIFIER_LENS_SIZE   = 220;   // px diameter of the lens
  const MAGNIFIER_ZOOM_MIN    = 1.5;
  const MAGNIFIER_ZOOM_MAX    = 8.0;
  const MAGNIFIER_ZOOM_STEP   = 0.5;
  const MAGNIFIER_REFRESH_MS  = 150;   // screenshot refresh interval

  let magnifierActive         = false;
  let magnifierZoom           = 2.5;
  let magnifierMouseX         = 0;
  let magnifierMouseY         = 0;
  let magnifierLens           = null;
  let magnifierCanvas         = null;
  let magnifierCtx            = null;
  let magnifierBadge          = null;
  let magnifierHint           = null;
  let magnifierScreenshot     = null;  // current Image object from background
  let magnifierRafId          = null;
  let magnifierRefreshTimer   = null;
  let magnifierBadgeTimer     = null;
  let magnifierZoomKeyLocked  = false; // prevents zoom repeat while key held
  // ─────────────────────────────────────────────────────────────

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

      case 'toggleMagnifier':
        toggleMagnifier();
        sendResponse({ success: true });
        break;

      case 'magnifierScreenshot':
        // Background sends a fresh data-URL screenshot
        if (request.dataUrl && magnifierActive) {
          const img = new Image();
          img.onload = () => { magnifierScreenshot = img; };
          img.src = request.dataUrl;
        }
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
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => processImage(img), { timeout: 2000 });
        } else {
          setTimeout(() => processImage(img), index * 300);
        }
      });
    } else if (force) {
      showToast('✅ No new images to process');
    }
  }

  async function processImage(img, speakResult = false) {
    img.classList.add('ac-processing');
    img.classList.remove('ac-processed', 'ac-error');

    if (settings.enableTts) {
      img.style.cursor = 'wait';
      img.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        speakText('Image is currently being processed. Please wait.');
      };
    }

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
        // Handle pending task from Celery
        if (response.task_id) {
          pollForResult(response.task_id, img, speakResult);
          return;
        }
        
        applyCaptionToImage(img, response.caption, response.audio_base64, speakResult);
      } else {
        throw new Error('Server offline or image failed');
      }

    } catch (error) {
      console.log('AccessiCap: Skipping image -', error.message);
      img.classList.remove('ac-processing');
      if (img.onclick) {
        img.onclick = null;
        img.style.cursor = '';
      }
    }
  }

  function applyCaptionToImage(img, caption, audioBase64, speakResult) {
    img.alt = caption;
    img.title = `AI: ${caption}`;

    img.classList.remove('ac-processing');
    if (settings.highlightProcessed) {
      img.classList.add('ac-processed');
    }

    addCaptionTooltip(img, caption);
    processedImages.add(img.src);

    if (settings.enableTts) {
      img.style.cursor = 'pointer';
      img.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (audioBase64) {
           const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
           audio.play();
        } else {
           speakText(caption);
        }
      };
    }

    if (speakResult || settings.autoSpeak) {
      if (audioBase64) {
         const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);
         audio.play();
      } else {
         speakText(caption);
      }
    }
    console.log('AccessiCap: Processed -', caption);
  }

  async function pollForResult(taskId, img, speakResult) {
    const check = async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'pollResult',
          taskId: taskId
        });
        
        if (response && response.status === 'completed' && response.result) {
          applyCaptionToImage(img, response.result.caption, response.result.audio_base64, speakResult);
        } else if (response && response.status === 'error') {
          console.error('AccessiCap: Task failed -', response.error);
          img.classList.remove('ac-processing');
          if (img.onclick) {
            img.onclick = null;
            img.style.cursor = '';
          }
        } else {
          setTimeout(check, 1000);
        }
      } catch(e) {
        setTimeout(check, 1000);
      }
    };
    check();
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

    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }

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

    utter.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.error('Web Speech error:', e.error);
      }
    };

    setTimeout(() => {
      window.speechSynthesis.speak(utter);
    }, 50);
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

  // ============================================================
  //  MAGNIFIER FEATURE
  // ============================================================

  function toggleMagnifier() {
    if (magnifierActive) {
      deactivateMagnifier();
    } else {
      activateMagnifier();
    }
  }

  function activateMagnifier() {
    // ── Guard: clean up any existing lens before creating a new one ──
    // This prevents stacking if activateMagnifier is called more than once
    if (magnifierLens) {
      // Already active — just ensure everything is tidy
      return;
    }

    magnifierActive = true;
    magnifierZoomKeyLocked = false;

    // Remove any orphaned lens elements from a previous broken state
    document.querySelectorAll('#ac-magnifier-lens, #ac-magnifier-badge, #ac-magnifier-hint')
      .forEach(el => el.remove());

    // ── Create lens ──
    magnifierLens = document.createElement('div');
    magnifierLens.id = 'ac-magnifier-lens';
    magnifierLens.style.width  = MAGNIFIER_LENS_SIZE + 'px';
    magnifierLens.style.height = MAGNIFIER_LENS_SIZE + 'px';
    magnifierLens.style.left   = '-9999px';
    magnifierLens.style.top    = '-9999px';

    magnifierCanvas = document.createElement('canvas');
    magnifierCanvas.id     = 'ac-magnifier-canvas';
    magnifierCanvas.width  = MAGNIFIER_LENS_SIZE;
    magnifierCanvas.height = MAGNIFIER_LENS_SIZE;
    magnifierCtx = magnifierCanvas.getContext('2d');
    magnifierLens.appendChild(magnifierCanvas);
    document.body.appendChild(magnifierLens);

    // ── Create zoom badge ──
    magnifierBadge = document.createElement('div');
    magnifierBadge.id = 'ac-magnifier-badge';
    updateBadgeText();
    document.body.appendChild(magnifierBadge);

    // ── Create hint bar ──
    magnifierHint = document.createElement('div');
    magnifierHint.id = 'ac-magnifier-hint';
    magnifierHint.innerHTML =
      '<span>🔍 Magnifier ON</span>' +
      '<span><kbd>↑</kbd><kbd>↓</kbd> zoom</span>' +
      '<span><kbd>Alt+M</kbd> off</span>';
    document.body.appendChild(magnifierHint);
    setTimeout(() => { if (magnifierHint) magnifierHint.remove(); magnifierHint = null; }, 3000);

    // ── Events ──
    document.addEventListener('mousemove', onMagnifierMouseMove, { passive: true });
    document.addEventListener('keydown',   onMagnifierKeyDown,   true);
    document.addEventListener('keyup',     onMagnifierKeyUp,     true);

    // ── Start screenshot refresh loop (only if not already running) ──
    if (!magnifierRefreshTimer) {
      requestMagnifierScreenshot();
      magnifierRefreshTimer = setInterval(requestMagnifierScreenshot, MAGNIFIER_REFRESH_MS);
    }

    // ── Start render loop (only if not already running) ──
    if (!magnifierRafId) {
      magnifierRafId = requestAnimationFrame(renderMagnifier);
    }

    showToast('🔍 Magnifier ON — ↑/↓ to zoom, Alt+M to exit');
  }

  function deactivateMagnifier() {
    magnifierActive = false;
    magnifierZoomKeyLocked = false;

    if (magnifierRafId)        { cancelAnimationFrame(magnifierRafId); magnifierRafId = null; }
    if (magnifierRefreshTimer) { clearInterval(magnifierRefreshTimer); magnifierRefreshTimer = null; }
    if (magnifierBadgeTimer)   { clearTimeout(magnifierBadgeTimer);    magnifierBadgeTimer = null; }

    document.removeEventListener('mousemove', onMagnifierMouseMove);
    document.removeEventListener('keydown',   onMagnifierKeyDown, true);
    document.removeEventListener('keyup',     onMagnifierKeyUp,   true);

    if (magnifierLens)   { magnifierLens.remove();   magnifierLens = null; }
    if (magnifierBadge)  { magnifierBadge.remove();  magnifierBadge = null; }
    if (magnifierHint)   { magnifierHint.remove();   magnifierHint = null; }

    // Also sweep for any orphaned elements (safety net)
    document.querySelectorAll('#ac-magnifier-lens, #ac-magnifier-badge, #ac-magnifier-hint')
      .forEach(el => el.remove());

    magnifierScreenshot = null;
    magnifierCtx = null;
    magnifierCanvas = null;

    showToast('🔍 Magnifier OFF');
  }

  function onMagnifierMouseMove(e) {
    magnifierMouseX = e.clientX;
    magnifierMouseY = e.clientY;
  }

  function onMagnifierKeyDown(e) {
    // Only intercept arrows when magnifier is active
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();

      // Ignore key-repeat events (e.repeat === true) — only respond to the
      // initial keydown so zoom advances one step per press, not continuously.
      if (e.repeat || magnifierZoomKeyLocked) return;

      magnifierZoomKeyLocked = true; // released in onMagnifierKeyUp

      if (e.key === 'ArrowUp') {
        magnifierZoom = Math.min(MAGNIFIER_ZOOM_MAX, +(magnifierZoom + MAGNIFIER_ZOOM_STEP).toFixed(1));
      } else {
        magnifierZoom = Math.max(MAGNIFIER_ZOOM_MIN, +(magnifierZoom - MAGNIFIER_ZOOM_STEP).toFixed(1));
      }
      updateBadgeText();
      flashBadge();
    }
  }

  function onMagnifierKeyUp(e) {
    // Unlock zoom step so next keydown can fire
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      magnifierZoomKeyLocked = false;
    }
  }

  function updateBadgeText() {
    if (magnifierBadge) {
      magnifierBadge.textContent = magnifierZoom.toFixed(1) + '×';
    }
  }

  function flashBadge() {
    if (!magnifierBadge) return;
    magnifierBadge.classList.add('ac-magnifier-badge-visible');
    clearTimeout(magnifierBadgeTimer);
    magnifierBadgeTimer = setTimeout(() => {
      if (magnifierBadge) magnifierBadge.classList.remove('ac-magnifier-badge-visible');
    }, 1200);
  }

  function requestMagnifierScreenshot() {
    // Ask the background service worker to capture the visible tab
    chrome.runtime.sendMessage({ action: 'captureMagnifierTab' }).catch(() => {});
  }

  function renderMagnifier() {
    if (!magnifierActive) return;

    const cx = magnifierMouseX;
    const cy = magnifierMouseY;
    const R  = MAGNIFIER_LENS_SIZE;

    // Position lens centered on cursor
    magnifierLens.style.left = cx + 'px';
    magnifierLens.style.top  = cy + 'px';

    // Position badge just below the lens
    if (magnifierBadge) {
      magnifierBadge.style.left = cx + 'px';
      magnifierBadge.style.top  = (cy + R / 2 + 10) + 'px';
    }

    // Draw zoomed content onto canvas
    if (magnifierScreenshot && magnifierCtx) {
      const dpr = window.devicePixelRatio || 1;
      // The viewport region to show inside the lens (in CSS pixels)
      const srcW = R / magnifierZoom;
      const srcH = R / magnifierZoom;
      const srcX = cx - srcW / 2;
      const srcY = cy - srcH / 2;

      // The screenshot covers the full viewport; map CSS coords → image coords
      const imgW  = magnifierScreenshot.naturalWidth;
      const imgH  = magnifierScreenshot.naturalHeight;
      const vw    = window.innerWidth;
      const vh    = window.innerHeight;
      const scaleX = imgW / vw;
      const scaleY = imgH / vh;

      magnifierCtx.clearRect(0, 0, R, R);

      // Clip to circle
      magnifierCtx.save();
      magnifierCtx.beginPath();
      magnifierCtx.arc(R / 2, R / 2, R / 2, 0, Math.PI * 2);
      magnifierCtx.clip();

      magnifierCtx.drawImage(
        magnifierScreenshot,
        srcX * scaleX, srcY * scaleY,   // source top-left in image
        srcW * scaleX, srcH * scaleY,   // source dimensions in image
        0, 0, R, R                       // destination: full canvas
      );
      magnifierCtx.restore();
    }

    magnifierRafId = requestAnimationFrame(renderMagnifier);
  }

})();