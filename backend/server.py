"""
AccessiCap Backend Server
AI-Powered Image Captioning with BLIP Model and Translation Support (v2 Optimized)
"""

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import base64
import logging
import os
import hashlib
import json
import redis.asyncio as redis
from celery.result import AsyncResult
from tasks import process_image_task

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("AccessiCap")

app = FastAPI(
    title="AccessiCap API",
    description="AI-Powered Image Captioning for Accessibility (Optimized)",
    version="2.0"
)

allowed_origins = [
    origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",") if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

class ImageRequest(BaseModel):
    imageData: str
    language: str = "en"

class CaptionResponse(BaseModel):
    caption: str
    language: str
    original_caption: Optional[str] = None
    translated: bool = False
    task_id: Optional[str] = None
    error: Optional[str] = None

@app.get("/health")
async def health_check():
    """Check if the server is healthy."""
    return {
        "status": "healthy",
        "message": "Server is running (V2 Celery Optimized)"
    }

@app.post("/caption", response_model=CaptionResponse)
async def generate_caption(request: ImageRequest):
    """
    Generate a caption with Celery and Redis cache.
    Returns immediately with a task_id if not cached.
    """
    try:
        image_data = request.imageData

        if "," in image_data:
            _, image_data = image_data.split(",", 1)

        img_bytes = base64.b64decode(image_data)
        
        # Create cache key from image hash and language
        image_hash = hashlib.sha256(img_bytes).hexdigest()
        cache_key = f"caption:{image_hash}:{request.language}"
        
        # Check cache
        cached = await redis_client.get(cache_key)
        if cached:
            data = json.loads(cached)
            return CaptionResponse(
                caption=data["caption"],
                language=request.language,
                original_caption=data["caption"] if data["translated_text"] == data["caption"] else None,
                translated=data["translated_text"] != data["caption"]
            )
        
        # Run inference in background using Celery
        task = process_image_task.delay(img_bytes, request.language, cache_key=cache_key)
        
        return CaptionResponse(
            caption="Processing image...", 
            language=request.language,
            task_id=task.id
        )

    except Exception as e:
        logger.error(f"Error processing image: {e}")
        return CaptionResponse(
            caption="Unable to process image at this time",
            language=request.language,
            error=str(e)
        )

@app.get("/result/{task_id}")
async def get_result(task_id: str):
    """Poll for the result of a caption generation task."""
    result = AsyncResult(task_id)
    if result.ready():
        res_data = result.get()
        return {"status": "completed", "result": res_data}
    return {"status": "pending"}

@app.get("/")
async def root():
    return {
        "name": "AccessiCap API V2",
        "status": "running",
        "endpoints": {
            "/health": "Check server health",
            "/caption": "Submit image for processing",
            "/result/{task_id}": "Poll for result"
        }
    }

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8001"))
    
    print("\n" + "="*50)
    print("  AccessiCap V2 Backend Server")
    print("  AI-Powered Image Captioning")
    print("="*50)
    print(f"\nStarting on: http://{host}:{port}")
    print("\n" + "="*50 + "\n")
    
    uvicorn.run(app, host=host, port=port, log_level="info")
