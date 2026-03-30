# AccessiCap Backend – Hugging Face Spaces Docker Image
# Deployed as a Docker Space; HF Spaces routes external traffic to port 7860.

FROM python:3.10-slim

# Create a non-root user (HF Spaces requirement)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy and install dependencies first (layer-cached)
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend source
COPY --chown=user . .

# HF Spaces exposes port 7860 to the internet
EXPOSE 7860

# Start the FastAPI server on port 7860
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860"]
