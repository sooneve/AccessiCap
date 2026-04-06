# AccessiCap - Changes Documentation
Date: 6 February 2026

This document describes all changes made to the AccessiCap project via GitHub Codex.

---

## 1. backend/server.py

### a) Added `os` import
The `os` standard library module was added to the imports so the server can read
environment variables at startup.

### b) Environment variable configuration (new constants)
Five new constants were added just below the global model variables:

  - CAPTION_MODEL_NAME       – The Hugging Face model ID or local folder path to load.
                               Default: "Salesforce/blip-image-captioning-base"
  - CAPTION_MAX_NEW_TOKENS   – Maximum number of tokens the model may generate per caption.
                               Default: 50
  - CAPTION_MIN_LENGTH       – Minimum token length enforced during generation.
                               Default: 5
  - CAPTION_NUM_BEAMS        – Number of beams used in beam-search decoding.
                               Higher values = more accurate but slower. Default: 4
  - CAPTION_PROMPT           – Optional text prompt prepended to every caption request.
                               Default: (empty string)

All five values can be overridden at runtime by setting the matching environment variable
before starting the server, e.g.:
    CAPTION_MODEL_NAME=Salesforce/blip-image-captioning-large python server.py

### c) load_models() – switched to the configurable model name
Previously the model was always loaded from the hardcoded string
"Salesforce/blip-image-captioning-base" (and accidentally loaded twice).
Now it logs the chosen model name and loads it once using the MODEL_NAME constant.

Before:
    logger.info("Loading BLIP image captioning model...")
    processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
    model     = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")

After:
    logger.info("Using model: %s", MODEL_NAME)
    processor = BlipProcessor.from_pretrained(MODEL_NAME)
    model     = BlipForConditionalGeneration.from_pretrained(MODEL_NAME)

### d) HealthResponse – added model_name field
The Pydantic response model for GET /health was extended with a `model_name` field so
clients can see which model is currently loaded. The return statement was updated to pass
MODEL_NAME into this field.

### e) generate_caption() – configurable generation parameters
Caption generation previously used a fixed call:
    inputs = processor(image, return_tensors="pt")
    output = model.generate(**inputs, max_new_tokens=50)

It now respects the environment variable constants and supports an optional prompt:
    prompt = CAPTION_PROMPT or None
    inputs = processor(image, text=prompt, return_tensors="pt")
    output = model.generate(
        **inputs,
        max_new_tokens=CAPTION_MAX_NEW_TOKENS,
        min_length=CAPTION_MIN_LENGTH,
        num_beams=CAPTION_NUM_BEAMS
    )

### f) Root endpoint – added model_name to response
The GET / endpoint now includes "model_name": MODEL_NAME in its JSON response, making
it easy to confirm which model is active without calling /health.

---

## 2. background.js

### a) New message handler – "fetchImageData"
A new case was added to the chrome.runtime.onMessage switch statement. When content.js
sends an "fetchImageData" message, the background worker calls fetchImageAsBase64() and
returns the result as a base64 data URL. On failure it returns { dataUrl: null, error: true }.

### b) New helper function – fetchImageAsBase64(imageUrl)
An async function that fetches an image URL from the background service worker context
(which has fewer CORS restrictions than a content script) and converts it to a base64
data URL. Steps:
  1. Validates the URL is not empty.
  2. Fetches with credentials omitted.
  3. Reads the content-type header (falls back to "image/jpeg").
  4. Converts the ArrayBuffer to base64 via arrayBufferToBase64().
  5. Returns a well-formed data URL: "data:<content-type>;base64,<data>".

### c) New helper function – arrayBufferToBase64(buffer)
Converts a raw ArrayBuffer to a base64 string without hitting the call-stack limit that
btoa(String.fromCharCode(...largeArray)) causes. It processes the bytes in 32 KB chunks.

---

## 3. content.js

### a) getImageAsBase64() – added background fetch fallback (third method)
Previously the function tried two methods and returned null on full failure:
  1. Canvas (fastest, blocked by cross-origin tainting)
  2. Direct fetch with CORS mode

A third fallback was added: if both methods fail the function now sends a
"fetchImageData" message to the background worker (added in background.js above).
The background worker fetches the image with its elevated permissions and returns the
data URL.

Before the change, the catch block for method 2 immediately returned null.
After the change it falls through to the background fetch attempt before returning null.

Effect: Significantly more images will be successfully captioned on sites that use
cross-origin CDN domains or strict CORS policies (social media, news sites, etc.).

---

## 4. manifest.json

### a) all_frames: true
Added to the content_scripts entry. The extension's content script (content.js) will
now be injected into every frame on the page, not just the top-level document.
This means images inside <iframe> elements are also scanned and captioned.

### b) match_about_blank: true
Also added to the content_scripts entry. Allows the content script to run inside
about:blank frames, which are commonly created by embedded widgets and dynamically
generated iframes.

---

## 5. readme.md

### a) New section – "Improving Caption Accuracy (Custom Training)"
Added after the API endpoints section. It explains:
  - How to fine-tune a BLIP model on a custom dataset.
  - How to export the model and point the server at it.
  - An example bash command showing all five environment variables.
  - A reference table listing each environment variable, its purpose, and its default value.
