// AccessiCap - Options Page Script

document.addEventListener('DOMContentLoaded', () => {
    console.log('AccessiCap options page loaded');

    // Elements
    const elements = {
        serverStatusDot: document.getElementById('serverStatusDot'),
        serverStatusText: document.getElementById('serverStatusText'),
        checkServerBtn: document.getElementById('checkServerBtn'),

        autoCaption: document.getElementById('autoCaption'),
        highlightProcessed: document.getElementById('highlightProcessed'),
        enableTts: document.getElementById('enableTts'),
        autoSpeak: document.getElementById('autoSpeak'),
        highContrast: document.getElementById('highContrast'),
        dyslexiaFont: document.getElementById('dyslexiaFont'),
        readingGuide: document.getElementById('readingGuide'),
        boldText: document.getElementById('boldText'),
        largeCaptions: document.getElementById('largeCaptions'),

        colorblindMode: document.getElementById('colorblindMode'),

        language: document.getElementById('language'),

        ttsRate: document.getElementById('ttsRate'),
        ttsPitch: document.getElementById('ttsPitch'),
        ttsVolume: document.getElementById('ttsVolume'),
        rateValue: document.getElementById('rateValue'),
        pitchValue: document.getElementById('pitchValue'),
        volumeValue: document.getElementById('volumeValue'),

        testTtsBtn: document.getElementById('testTtsBtn'),
        stopTtsBtn: document.getElementById('stopTtsBtn'),
        saveBtn: document.getElementById('saveBtn'),
        resetBtn: document.getElementById('resetBtn'),
        exportBtn: document.getElementById('exportBtn'),
        importBtn: document.getElementById('importBtn'),

        toast: document.getElementById('toast')
    };

    loadSettings();
    checkServerStatus();
    setupEventListeners();

    function setupEventListeners() {
        elements.ttsRate.addEventListener('input', () => {
            elements.rateValue.textContent = elements.ttsRate.value + 'x';
        });

        elements.ttsPitch.addEventListener('input', () => {
            elements.pitchValue.textContent = elements.ttsPitch.value;
        });

        elements.ttsVolume.addEventListener('input', () => {
            elements.volumeValue.textContent = Math.round(elements.ttsVolume.value * 100) + '%';
        });

        elements.checkServerBtn.addEventListener('click', checkServerStatus);

        elements.testTtsBtn.addEventListener('click', testTTS);
        elements.stopTtsBtn.addEventListener('click', stopTTS);

        elements.saveBtn.addEventListener('click', saveSettings);
        elements.resetBtn.addEventListener('click', resetSettings);
        elements.exportBtn.addEventListener('click', exportSettings);
        elements.importBtn.addEventListener('click', importSettings);
    }

    function loadSettings() {
        chrome.storage.sync.get([
            'language',
            'autoCaption',
            'highlightProcessed',
            'enableTts',
            'autoSpeak',
            'highContrast',
            'dyslexiaFont',
            'readingGuide',
            'boldText',
            'largeCaptions',
            'colorblindMode',
            'ttsRate',
            'ttsPitch',
            'ttsVolume'
        ], (data) => {
            // Language
            elements.language.value = data.language || 'en';

            // Toggles
            elements.autoCaption.checked = data.autoCaption !== false;
            elements.highlightProcessed.checked = data.highlightProcessed !== false;
            elements.enableTts.checked = data.enableTts !== false;
            elements.autoSpeak.checked = !!data.autoSpeak;
            elements.highContrast.checked = !!data.highContrast;
            elements.dyslexiaFont.checked = !!data.dyslexiaFont;
            elements.readingGuide.checked = !!data.readingGuide;
            elements.boldText.checked = !!data.boldText;
            elements.largeCaptions.checked = data.largeCaptions !== false;
            elements.colorblindMode.value = data.colorblindMode || 'none';

            const rate = data.ttsRate || 1.0;
            const pitch = data.ttsPitch || 1.0;
            const volume = data.ttsVolume !== undefined ? data.ttsVolume : 1.0;

            elements.ttsRate.value = rate;
            elements.ttsPitch.value = pitch;
            elements.ttsVolume.value = volume;

            elements.rateValue.textContent = rate + 'x';
            elements.pitchValue.textContent = pitch;
            elements.volumeValue.textContent = Math.round(volume * 100) + '%';
        });
    }

    function saveSettings() {
        const settings = {
            language: elements.language.value,
            autoCaption: elements.autoCaption.checked,
            highlightProcessed: elements.highlightProcessed.checked,
            enableTts: elements.enableTts.checked,
            autoSpeak: elements.autoSpeak.checked,
            highContrast: elements.highContrast.checked,
            dyslexiaFont: elements.dyslexiaFont.checked,
            readingGuide: elements.readingGuide.checked,
            boldText: elements.boldText.checked,
            largeCaptions: elements.largeCaptions.checked,
            colorblindMode: elements.colorblindMode.value,
            ttsRate: parseFloat(elements.ttsRate.value),
            ttsPitch: parseFloat(elements.ttsPitch.value),
            ttsVolume: parseFloat(elements.ttsVolume.value)
        };

        chrome.storage.sync.set(settings, () => {
            showToast('Settings saved successfully!', 'success');

            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.url && !tab.url.startsWith('chrome://')) {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'settingsUpdated',
                            settings: settings
                        }).catch(() => { });
                    }
                });
            });
        });
    }

    function resetSettings() {
        if (!confirm('Are you sure you want to reset all settings to defaults?')) {
            return;
        }

        const defaults = {
            language: 'en',
            autoCaption: true,
            highlightProcessed: true,
            enableTts: true,
            autoSpeak: false,
            highContrast: false,
            dyslexiaFont: false,
            readingGuide: false,
            boldText: false,
            largeCaptions: true,
            colorblindMode: 'none',
            ttsRate: 1.0,
            ttsPitch: 1.0,
            ttsVolume: 1.0
        };

        chrome.storage.sync.set(defaults, () => {
            loadSettings();
            showToast('Settings reset to defaults!', 'success');
        });
    }

    function exportSettings() {
        chrome.storage.sync.get(null, (data) => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'accessicap-settings.json';
            a.click();

            URL.revokeObjectURL(url);
            showToast('Settings exported!', 'success');
        });
    }

    function importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const settings = JSON.parse(event.target.result);
                    chrome.storage.sync.set(settings, () => {
                        loadSettings();
                        showToast('Settings imported successfully!', 'success');
                    });
                } catch (error) {
                    showToast('Error importing settings: Invalid file', 'error');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    async function checkServerStatus() {
        elements.serverStatusText.textContent = 'Checking...';

        try {
            const response = await chrome.runtime.sendMessage({ action: 'checkServerStatus' });

            if (response && response.online) {
                elements.serverStatusDot.classList.remove('offline');
                elements.serverStatusDot.classList.add('online');
                elements.serverStatusText.textContent = 'Server is online and ready!';
                elements.serverStatusText.style.color = '#27ae60';
            } else {
                setOffline();
            }
        } catch (error) {
            setOffline();
        }
    }

    function setOffline() {
        elements.serverStatusDot.classList.remove('online');
        elements.serverStatusDot.classList.add('offline');
        elements.serverStatusText.textContent = 'Server is offline. Run: python backend/server.py';
        elements.serverStatusText.style.color = '#e74c3c';
    }

    function testTTS() {
        const lang = elements.language.value;
        const testMessages = {
            'en': 'Hello! This is a test of AccessiCap text-to-speech. The settings you configured are now applied.',
            'hi': 'नमस्ते! यह AccessiCap टेक्स्ट-टू-स्पीच का एक परीक्षण है।',
            'ne': 'नमस्ते! यो AccessiCap पाठ-वाणी को एक परीक्षण हो।',
            'es': '¡Hola! Esta es una prueba del texto a voz de AccessiCap.',
            'fr': 'Bonjour! Ceci est un test du texte-parole AccessiCap.',
            'de': 'Hallo! Dies ist ein Test der AccessiCap-Text-zu-Sprache.',
            'zh': '你好！这是 AccessiCap 文字转语音的测试。',
            'ja': 'こんにちは！これはAccessiCapのテキスト読み上げのテストです。',
            'ko': '안녕하세요! 이것은 AccessiCap 텍스트 음성 변환 테스트입니다.',
            'ar': 'مرحبا! هذا اختبار لتحويل النص إلى كلام AccessiCap.',
            'ru': 'Привет! Это тест преобразования текста в речь AccessiCap.',
            'pt': 'Olá! Este é um teste do texto para fala do AccessiCap.'
        };

        const message = testMessages[lang] || testMessages['en'];

        chrome.runtime.sendMessage({
            action: 'speak',
            text: message,
            lang: lang,
            rate: parseFloat(elements.ttsRate.value),
            pitch: parseFloat(elements.ttsPitch.value),
            volume: parseFloat(elements.ttsVolume.value)
        });

        showToast('🔊 Playing TTS test...', 'success');
    }

    function stopTTS() {
        chrome.runtime.sendMessage({ action: 'stopSpeaking' });
        showToast('⏹️ TTS stopped', 'success');
    }

    function showToast(message, type = 'success') {
        elements.toast.textContent = message;
        elements.toast.className = `toast ${type} show`;

        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, 3000);
    }
});