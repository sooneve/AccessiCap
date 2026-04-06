// Background service worker for API calls

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'generateAltText') {
        generateAltText(request.imageUrl, request.language)
            .then(altText => sendResponse({ success: true, altText }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }
});

async function generateAltText(imageUrl, language = 'en') {
    const startTime = Date.now();

    // Get API key from storage
    const { apiKey } = await chrome.storage.sync.get('apiKey');

    if (!apiKey) {
        throw new Error('API key not configured');
    }

    try {
        // Fetch the image and convert to base64
        const imageResponse = await fetch(imageUrl);
        const imageBlob = await imageResponse.blob();
        const base64Image = await blobToBase64(imageBlob);

        // Determine media type
        const mediaType = imageBlob.type || 'image/jpeg';

        // Language prompts
        const languagePrompts = {
            'en': 'Describe this image in detail in English.',
            'ne': 'यो तस्बिरलाई नेपालीमा विस्तृत रूपमा वर्णन गर्नुहोस्।',
            'hi': 'इस छवि का हिंदी में विस्तार से वर्णन करें।',
            'es': 'Describe esta imagen en detalle en español.',
            'fr': 'Décrivez cette image en détail en français.',
            'de': 'Beschreiben Sie dieses Bild detailliert auf Deutsch.',
            'ja': 'この画像を日本語で詳しく説明してください。',
            'ko': '이 이미지를 한국어로 자세히 설명하세요.',
            'zh': '用中文详细描述这张图片。'
        };

        const prompt = languagePrompts[language] || languagePrompts['en'];

        // Call Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 300,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: base64Image
                            }
                        },
                        {
                            type: 'text',
                            text: prompt + ' Provide a concise but descriptive alt-text suitable for screen readers (2-3 sentences).'
                        }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        const altText = data.content[0].text.trim();

        // Update statistics
        const processingTime = Date.now() - startTime;
        updateStatistics(processingTime);

        return altText;

    } catch (error) {
        console.error('Error generating alt-text:', error);
        throw error;
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function updateStatistics(processingTime) {
    const stats = await chrome.storage.local.get(['imagesProcessed', 'totalProcessingTime']);

    const imagesProcessed = (stats.imagesProcessed || 0) + 1;
    const totalProcessingTime = (stats.totalProcessingTime || 0) + processingTime;

    chrome.storage.local.set({ imagesProcessed, totalProcessingTime });
}
