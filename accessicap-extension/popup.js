// Load saved settings
chrome.storage.sync.get([
    'apiKey', 'autoGenerate', 'altTextLanguage', 'translationLanguage',
    'speechRate', 'autoSpeak', 'highContrast', 'dyslexiaFont', 'textSize'
], (data) => {
    if (data.apiKey) {
        document.getElementById('apiKey').value = data.apiKey;
        updateApiStatus(true);
    }
    if (data.autoGenerate !== undefined) document.getElementById('autoGenerate').checked = data.autoGenerate;
    if (data.altTextLanguage) document.getElementById('altTextLanguage').value = data.altTextLanguage;
    if (data.translationLanguage) document.getElementById('translationLanguage').value = data.translationLanguage;
    if (data.speechRate) document.getElementById('speechRate').value = data.speechRate;
    if (data.autoSpeak) document.getElementById('autoSpeak').checked = data.autoSpeak;
    if (data.textSize) document.getElementById('textSize').value = data.textSize;

    updateRateDisplay();
    updateSizeDisplay();

    if (data.highContrast) document.getElementById('highContrast').classList.add('active');
    if (data.dyslexiaFont) document.getElementById('dyslexiaFont').classList.add('active');
});

// Load statistics
chrome.storage.local.get(['imagesProcessed', 'totalProcessingTime'], (data) => {
    document.getElementById('imagesProcessed').textContent = data.imagesProcessed || 0;
    const avgTime = data.imagesProcessed ? (data.totalProcessingTime / data.imagesProcessed / 1000).toFixed(1) : '0.0';
    document.getElementById('avgTime').textContent = avgTime + 's';
});

// Save settings button
document.getElementById('saveSettings').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const autoGenerate = document.getElementById('autoGenerate').checked;

    if (apiKey && !apiKey.startsWith('sk-ant-')) {
        alert('Invalid API key format. Should start with sk-ant-');
        return;
    }

    chrome.storage.sync.set({ apiKey, autoGenerate }, () => {
        updateApiStatus(!!apiKey);
        alert('Settings saved! Reload the page to apply changes.');
    });
});

function updateApiStatus(connected) {
    const status = document.getElementById('apiStatus');
    if (connected) {
        status.className = 'api-status connected';
        status.textContent = '✓ API connected';
    } else {
        status.className = 'api-status disconnected';
        status.textContent = '⚠️ API key not configured';
    }
}

// Language selectors
document.getElementById('altTextLanguage').addEventListener('change', (e) => {
    chrome.storage.sync.set({ altTextLanguage: e.target.value });
});

document.getElementById('translationLanguage').addEventListener('change', (e) => {
    chrome.storage.sync.set({ translationLanguage: e.target.value });
});

// Speech rate control
document.getElementById('speechRate').addEventListener('input', (e) => {
    const rate = parseFloat(e.target.value);
    chrome.storage.sync.set({ speechRate: rate });
    updateRateDisplay();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateSpeechRate', rate });
    });
});

function updateRateDisplay() {
    const rate = document.getElementById('speechRate').value;
    document.getElementById('rateValue').textContent = rate + 'x';
}

// Auto-speak toggle
document.getElementById('autoSpeak').addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoSpeak: e.target.checked });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateAutoSpeak', enabled: e.target.checked });
    });
});

// High contrast toggle
document.getElementById('highContrast').addEventListener('click', (e) => {
    const isActive = e.target.classList.toggle('active');
    chrome.storage.sync.set({ highContrast: isActive });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleHighContrast', enabled: isActive });
    });
});

// Dyslexia font toggle
document.getElementById('dyslexiaFont').addEventListener('click', (e) => {
    const isActive = e.target.classList.toggle('active');
    chrome.storage.sync.set({ dyslexiaFont: isActive });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleDyslexiaFont', enabled: isActive });
    });
});

// Text size control
document.getElementById('textSize').addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    chrome.storage.sync.set({ textSize: size });
    updateSizeDisplay();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'updateTextSize', size });
    });
});

function updateSizeDisplay() {
    const size = document.getElementById('textSize').value;
    document.getElementById('sizeValue').textContent = size + '%';
}
