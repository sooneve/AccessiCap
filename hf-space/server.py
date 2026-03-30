"""
AccessiCap Backend Server
AI-Powered Image Captioning with BLIP Model and Translation Support

To run:
    cd backend
    python server.py

The server will start on http://127.0.0.1:8001
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import base64
from io import BytesIO
import logging
import asyncio
import gc
import os

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AccessiCap")

app = FastAPI(
    title="AccessiCap API",
    description="AI-Powered Image Captioning for Accessibility",
    version="2.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

processor = None
model = None
translator = None
models_loaded = False
MODEL_NAME = os.getenv("CAPTION_MODEL_NAME", "Salesforce/blip-image-captioning-base")
CAPTION_MAX_NEW_TOKENS = int(os.getenv("CAPTION_MAX_NEW_TOKENS", "50"))
CAPTION_MIN_LENGTH = int(os.getenv("CAPTION_MIN_LENGTH", "5"))
CAPTION_NUM_BEAMS = int(os.getenv("CAPTION_NUM_BEAMS", "4"))
CAPTION_PROMPT = os.getenv("CAPTION_PROMPT", "").strip()

SUPPORTED_LANGUAGES = {
    'en': 'English',
    'hi': 'Hindi',
    'ne': 'Nepali',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh-cn': 'Chinese (Simplified)',
    'ja': 'Japanese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'ru': 'Russian',
    'pt': 'Portuguese'
}


def load_models():
    """Load AI models on startup"""
    global processor, model, translator, models_loaded
    
    try:
        logger.info("Loading AI models...")

        from transformers import BlipProcessor, BlipForConditionalGeneration
        
        logger.info("Using model: %s", MODEL_NAME)
        processor = BlipProcessor.from_pretrained(MODEL_NAME)
        model = BlipForConditionalGeneration.from_pretrained(MODEL_NAME)

        try:
            from googletrans import Translator
            translator = Translator()
            logger.info("Google Translate initialized")
        except Exception as e:
            logger.warning(f"Google Translate not available: {e}")
            translator = None
        
        models_loaded = True
        logger.info("✅ All models loaded successfully!")
        
    except Exception as e:
        logger.error(f"❌ Error loading models: {e}")
        models_loaded = False


def translate_text(text: str, target_lang: str) -> str:
    """Translate text with multiple fallback methods"""
    global translator
    
    if not text or target_lang == 'en':
        return text

    lang_code = target_lang.lower()
    if lang_code == 'zh':
        lang_code = 'zh-cn'

    if translator:
        try:
            result = translator.translate(text, dest=lang_code)
            if result and result.text:
                logger.info(f"Translated to {lang_code}: {result.text}")
                return result.text
        except Exception as e:
            logger.warning(f"Google Translate failed for {lang_code}: {e}")
            try:
                from googletrans import Translator
                translator = Translator()
            except:
                pass
    

    try:
        from deep_translator import GoogleTranslator
        result = GoogleTranslator(source='en', target=lang_code).translate(text)
        if result:
            logger.info(f"Deep Translated to {lang_code}: {result}")
            return result
    except ImportError:
        pass  
    except Exception as e:
        logger.warning(f"Deep translator failed: {e}")

    logger.warning(f"Translation to {lang_code} failed, returning English")
    return text


class ImageRequest(BaseModel):
    imageData: str  
    language: str = "en"


class CaptionResponse(BaseModel):
    caption: str
    language: str
    original_caption: Optional[str] = None
    translated: bool = False
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    translator_available: bool
    message: str
    supported_languages: list
    model_name: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the server and models are ready"""
    return HealthResponse(
        status="healthy" if models_loaded else "degraded",
        models_loaded=models_loaded,
        translator_available=translator is not None,
        message="Server is running" + (" and models are loaded" if models_loaded else " but models failed to load"),
        supported_languages=list(SUPPORTED_LANGUAGES.keys()),
        model_name=MODEL_NAME
    )


@app.post("/caption", response_model=CaptionResponse)
async def generate_caption(request: ImageRequest):
    """Generate a caption for the provided image"""
    
    if not models_loaded:
        return CaptionResponse(
            caption="AI models not loaded. Please restart the server.",
            language=request.language,
            error="models_not_loaded"
        )
    
    try:
        from PIL import Image
        
        image_data = request.imageData
        
        if "," in image_data:
            header, image_data = image_data.split(",", 1)
        
        img_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(img_bytes)).convert("RGB")
        
        prompt = CAPTION_PROMPT or None
        inputs = processor(image, text=prompt, return_tensors="pt")
        output = model.generate(
            **inputs,
            max_new_tokens=CAPTION_MAX_NEW_TOKENS,
            min_length=CAPTION_MIN_LENGTH,
            num_beams=CAPTION_NUM_BEAMS
        )
        english_caption = processor.decode(output[0], skip_special_tokens=True)
        
        logger.info(f"Generated caption: {english_caption}")
        
        target_lang = request.language.lower()
        translated = False
        final_caption = english_caption
        
        if target_lang and target_lang != 'en':
            translated_caption = translate_text(english_caption, target_lang)
            if translated_caption != english_caption:
                final_caption = translated_caption
                translated = True
        
        return CaptionResponse(
            caption=final_caption,
            language=target_lang,
            original_caption=english_caption if translated else None,
            translated=translated
        )
        
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return CaptionResponse(
            caption="Unable to process image at this time",
            language=request.language,
            error=str(e)
        )
    finally:
        if TORCH_AVAILABLE and torch.cuda.is_available():
            torch.cuda.empty_cache()
        
        gc.collect()


@app.get("/languages")
async def get_languages():
    """Get list of supported languages"""
    return {
        "languages": SUPPORTED_LANGUAGES,
        "translator_available": translator is not None
    }


@app.get("/")
async def root():
    """Root endpoint with API info"""
    return {
        "name": "AccessiCap API",
        "version": "2.0",
        "status": "running",
        "model_name": MODEL_NAME,
        "endpoints": {
            "/health": "Check server health",
            "/caption": "Generate image caption (POST)",
            "/languages": "Get supported languages"
        }
    }


@app.on_event("startup")
async def startup_event():
    """Load models on startup"""
    load_models()


if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*50)
    print("  AccessiCap Backend Server")
    print("  AI-Powered Image Captioning")
    print("="*50)
    print("\nSupported Languages:")
    for code, name in SUPPORTED_LANGUAGES.items():
        print(f"  {code}: {name}")
    print("\n" + "="*50 + "\n")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8001,
        log_level="info"
    )


# ==============================================================================
# HOW TO RUN THIS SERVER
# ==============================================================================
#
# Step 1: Install dependencies (run once)
#   pip install -r requirements.txt
#
# Step 2: Navigate to the backend folder
#   cd backend
#
# Step 3: Run the server
#   python server.py
#
# The server will start at: http://127.0.0.1:8001
#
# Step 4: To STOP the server
#   Press Ctrl+C in the terminal
#
# Alternative: Run with uvicorn directly
#   uvicorn server:app --host 127.0.0.1 --port 8001 --reload
#
# ==============================================================================#
