"""
tasks.py  –  Celery worker for AccessiCap
Uses the quantized ONNX vision encoder for speed, PyTorch text decoder for
auto-regressive generation.
"""

import os
import io
import base64

import numpy as np
import torch
from celery import Celery
from PIL import Image
from transformers import BlipProcessor, BlipForConditionalGeneration
import onnxruntime as ort
from googletrans import Translator
from gtts import gTTS

# ── Celery / Redis config ─────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
app = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)

# ── Globals (loaded once per worker) ─────────────────────────────────────────
ort_session = None
blip_model   = None
processor    = None
translator   = Translator()

ONNX_MODEL_PATH = os.getenv("ONNX_MODEL_PATH", "blip_encoder_quantized.onnx")


def init_models():
    """Lazily load the ONNX encoder + PyTorch text decoder."""
    global ort_session, blip_model, processor

    if processor is not None:
        return  # Already loaded

    model_name = "Salesforce/blip-image-captioning-base"
    print(f"[init] Loading processor from {model_name} ...")
    processor = BlipProcessor.from_pretrained(model_name)

    # ONNX vision encoder
    if os.path.exists(ONNX_MODEL_PATH):
        print(f"[init] Loading ONNX encoder from {ONNX_MODEL_PATH} ...")
        ort_session = ort.InferenceSession(
            ONNX_MODEL_PATH,
            providers=["CPUExecutionProvider"],
        )
        # Warm-up
        dummy = processor(
            images=Image.new("RGB", (384, 384)), return_tensors="np"
        )
        ort_session.run(None, {"pixel_values": dummy["pixel_values"]})
        print("[init] ONNX encoder warmed up.")
    else:
        print(
            f"[init] WARNING: {ONNX_MODEL_PATH} not found. "
            "Run convert_blip_to_onnx.py first. Falling back to full PyTorch model."
        )

    # Full PyTorch model (needed for text decoder; vision encoder re-used only
    # when ONNX is unavailable)
    print(f"[init] Loading full BLIP model for text generation ...")
    blip_model = BlipForConditionalGeneration.from_pretrained(model_name)
    blip_model.eval()
    print("[init] Models ready.")


def generate_caption(image_bytes: bytes) -> str:
    """Generate a caption using the ONNX encoder + PyTorch text decoder."""
    init_models()

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")

    with torch.no_grad():
        if ort_session is not None:
            # Fast path: ONNX encoder → inject hidden states into decoder
            pixel_np = inputs["pixel_values"].numpy()
            encoder_hidden = ort_session.run(
                None, {"pixel_values": pixel_np}
            )[0]                                          # (1, seq, hidden)
            encoder_hidden_t = torch.from_numpy(encoder_hidden)

            # Use the model's text decoder with pre-computed image features
            output_ids = blip_model.generate(
                pixel_values=inputs["pixel_values"],      # still needed internally
                encoder_hidden_states=encoder_hidden_t,
                max_new_tokens=50,
            )
        else:
            # Fallback: pure PyTorch
            output_ids = blip_model.generate(
                **inputs, max_new_tokens=50
            )

    caption = processor.decode(output_ids[0], skip_special_tokens=True)
    return caption


def translate_and_speak(text: str, target_lang: str):
    """Translate text and generate TTS audio as base64."""
    if not target_lang or target_lang.lower() == "en":
        translated_text = text
        tts_lang = "en"
    else:
        try:
            translation = translator.translate(text, dest=target_lang)
            translated_text = translation.text
            tts_lang = target_lang
        except Exception as exc:
            print(f"[translate] Translation failed: {exc}")
            translated_text = text
            tts_lang = "en"

    try:
        tts = gTTS(text=translated_text, lang=tts_lang)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        audio_base64 = base64.b64encode(buf.read()).decode()
    except Exception as exc:
        print(f"[tts] TTS failed: {exc}")
        audio_base64 = None

    return audio_base64, translated_text


@app.task
def process_image_task(image_bytes: bytes, target_lang: str, cache_key: str = None):
    caption = generate_caption(image_bytes)
    audio_base64, translated_text = translate_and_speak(caption, target_lang)

    return {
        "caption": caption,
        "translated_text": translated_text,
        "audio_base64": audio_base64,
        "language": target_lang,
    }
