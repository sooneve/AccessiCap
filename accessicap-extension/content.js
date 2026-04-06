let speechRate = 1.0;
let autoSpeak = false;
let altTextLanguage = 'en';
let translationLanguage = 'en';
let currentUtterance = null;
let processedImages = new Set();
let hoveredImage = null;

// Load settings
chrome.storage.sync.get([
    'apiKey', 'autoGenerate', 'altTextLanguage', 'translationLanguage',
    'speechRate', 'autoSpeak', 'highContrast', 'dyslexiaFont', 'textSize'
], (data) => {
    if (data.speechRate) speechRate = data.speechRate;
    if (data.autoSpeak) autoSpeak = data.autoSpeak;
    if (data.altTextLanguage) altTextLanguage = data.altTextLanguage;
    if (data.translationLanguage) translationLanguage = data.translationLanguage;
    if (data.highContrast) applyHighContrast(true);
    if (data.dyslexiaFont) applyDyslexiaFont(true);
    if (data.textSize) applyTextSize(data.textSize);

    // Start processing images if auto-generate is enabled
    if (data.apiKey && data.autoGenerate !== false) {
        processImagesOnPage();
        observeNewImages();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'updateSpeechRate':
            speechRate = request.rate;
            break;
        case 'updateAutoSpeak':
            autoSpeak = request.enabled;
            break;
        case 'updateLanguage':
            altTextLanguage = request.language;
            break;
        case 'toggleHighContrast':
            applyHighContrast(request.enabled);
            break;
        case 'toggleDyslexiaFont':
            applyDyslexiaFont(request.enabled);
            break;
        case 'updateTextSize':
            applyTextSize(request.size);
            break;
    }
});

// Process all images on the page
async function processImagesOnPage() {
    const images = document.querySelectorAll('img');

    for (const img of images) {
        if (!processedImages.has(img)) {
            await processImage(img);
        }
    }
}

// Process a single image
async function processImage(img) {
    // Skip if already processed or has good alt text
    if (processedImages.has(img) || (img.alt && img.alt.trim().length > 10)) {
        return;
    }

    // Skip tiny images (likely icons)
    if (img.width < 50 || img.height < 50) {
        return;
    }

    processedImages.add(img);

    // Add loading indicator
    img.classList.add('accessicap-processing');

    try {
        const imageUrl = img.src;

        // Generate alt-text using background script
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'generateAltText',
                imageUrl: imageUrl,
                language: altTextLanguage
            }, (response) => {
                if (response && response.success) {
                    resolve(response.altText);
                } else {
                    reject(new Error(response?.error || 'Failed to generate alt-text'));
                }
            });
        });

        // Set the alt-text
        img.alt = response;
        img.title = response;
        img.setAttribute('data-accessicap-generated', 'true');

        // Add visual indicator
        img.classList.remove('accessicap-processing');
        img.classList.add('accessicap-enhanced');

        // Create overlay badge
        createAltTextBadge(img, response);

    } catch (error) {
        console.error('Failed to process image:', error);
        img.classList.remove('accessicap-processing');
    }
}

// Create visual badge for AI-generated alt-text
function createAltTextBadge(img, altText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'accessicap-image-wrapper';

    const badge = document.createElement('div');
    badge.className = 'accessicap-badge';
    badge.innerHTML = '🤖 AI';
    badge.title = altText;

    // Wrap image
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
    wrapper.appendChild(badge);

    // Add hover functionality
    if (autoSpeak) {
        img.addEventListener('mouseenter', () => {
            hoveredImage = img;
            speakText(altText);
        });

        img.addEventListener('mouseleave', () => {
            hoveredImage = null;
            if (currentUtterance) {
                speechSynthesis.cancel();
            }
        });
    }
}

// Observe for new images added dynamically
function observeNewImages() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.tagName === 'IMG') {
                    processImage(node);
                } else if (node.querySelectorAll) {
                    const images = node.querySelectorAll('img');
                    images.forEach(img => processImage(img));
                }
            });
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.altKey) {
        switch (e.key.toLowerCase()) {
            case 's':
                e.preventDefault();
                speakSelectedText();
                break;
            case 'i':
                e.preventDefault();
                speakImageAltText();
                break;
            case 't':
                e.preventDefault();
                translateSelectedText();
                break;
            case 'c':
                e.preventDefault();
                toggleHighContrastShortcut();
                break;
            case 'r':
                e.preventDefault();
                regenerateAllAltText();
                break;
        }
    }
});

// Speak selected text
function speakSelectedText() {
    const selectedText = window.getSelection().toString().trim();

    if (!selectedText) {
        showNotification('Please select some text first', 'info');
        return;
    }

    speakText(selectedText);
}

// Speak image alt-text on hover
function speakImageAltText() {
    if (hoveredImage && hoveredImage.alt) {
        speakText(hoveredImage.alt);
    } else {
        showNotification('Hover over an image first', 'info');
    }
}

// Text-to-speech function
function speakText(text) {
    if (currentUtterance) {
        speechSynthesis.cancel();
    }

    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = speechRate;
    currentUtterance.onend = () => {
        currentUtterance = null;
    };

    speechSynthesis.speak(currentUtterance);
    showNotification('🔊 Speaking...', 'success');
}

// Translation function
async function translateSelectedText() {
    const selectedText = window.getSelection().toString().trim();

    if (!selectedText) {
        showNotification('Please select some text first', 'info');
        return;
    }

    showNotification('🌍 Translating...', 'info');

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translationLanguage}&dt=t&q=${encodeURIComponent(selectedText)}`;
        const response = await fetch(url);
        const data = await response.json();
        const translatedText = data[0].map(item => item[0]).join('');

        showTranslation(translatedText, selectedText);
    } catch (error) {
        showNotification('Translation failed. Please try again.', 'error');
    }
}

// Show translation popup
function showTranslation(translated, original) {
    const existing = document.getElementById('accessicap-translation-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'accessicap-translation-popup';
    popup.className = 'accessicap-popup';
    popup.innerHTML = `
        <div class="popup-header">
            <strong>Translation</strong>
            <button class="popup-close">×</button>
        </div>
        <div class="popup-content">
            <div class="translation-result">${translated}</div>
            <div class="translation-original">${original}</div>
        </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector('.popup-close').addEventListener('click', () => {
        popup.remove();
    });

    setTimeout(() => {
        if (popup.parentElement) popup.remove();
    }, 10000);
}

// Regenerate alt-text for all images
async function regenerateAllAltText() {
    processedImages.clear();
    const badges = document.querySelectorAll('.accessicap-image-wrapper');
    badges.forEach(wrapper => {
        const img = wrapper.querySelector('img');
        const parent = wrapper.parentNode;
        parent.insertBefore(img, wrapper);
        wrapper.remove();
    });

    showNotification('♻️ Regenerating alt-text for all images...', 'info');
    await processImagesOnPage();
    showNotification('✓ Alt-text regeneration complete', 'success');
}

// Visual enhancement functions
function applyHighContrast(enabled) {
    if (enabled) {
        document.documentElement.classList.add('accessicap-high-contrast');
    } else {
        document.documentElement.classList.remove('accessicap-high-contrast');
    }
}

function toggleHighContrastShortcut() {
    const isEnabled = document.documentElement.classList.contains('accessicap-high-contrast');
    const newState = !isEnabled;
    applyHighContrast(newState);
    chrome.storage.sync.set({ highContrast: newState });
    showNotification(newState ? 'High contrast enabled' : 'High contrast disabled', 'success');
}

function applyDyslexiaFont(enabled) {
    if (enabled) {
        document.documentElement.classList.add('accessicap-dyslexia-font');
    } else {
        document.documentElement.classList.remove('accessicap-dyslexia-font');
    }
}

function applyTextSize(size) {
    document.documentElement.style.fontSize = size + '%';
}

// Notification system
function showNotification(message, type) {
    const existing = document.getElementById('accessicap-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'accessicap-notification';
    notification.className = `accessicap-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Track hovered images for keyboard shortcut
document.addEventListener('mouseover', (e) => {
    if (e.target.tagName === 'IMG') {
        hoveredImage = e.target;
    }
});

document.addEventListener('mouseout', (e) => {
    if (e.target.tagName === 'IMG') {
        hoveredImage = null;
    }
});
