FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    HOST=0.0.0.0 \
    # Cache model weights inside the image
    TRANSFORMERS_CACHE=/app/model_cache \
    HF_HOME=/app/model_cache

WORKDIR /app

# Install dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Pre-download the BLIP model weights at build time so the container
# doesn't need to fetch ~900 MB on every cold start.
# ARG lets you pass HF_TOKEN via: gcloud builds submit --substitutions=_HF_TOKEN=hf_...
ARG HF_TOKEN=""
RUN python3 - <<'EOF'
import os, sys
token = os.getenv("HF_TOKEN", "")
try:
    from transformers import BlipProcessor, BlipForConditionalGeneration
    kwargs = {"token": token} if token else {}
    print("Downloading BLIP model weights...")
    BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base", **kwargs)
    BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base", **kwargs)
    print("Model download complete.")
except Exception as e:
    print(f"Warning: could not pre-download model: {e}", file=sys.stderr)
    sys.exit(0)   # Don't fail the build — runtime will try again
EOF

EXPOSE 8080

CMD ["python", "server.py"]
