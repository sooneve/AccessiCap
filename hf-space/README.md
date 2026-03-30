---
title: AccessiCap API
emoji: 🖼️
colorFrom: purple
colorTo: blue
sdk: docker
pinned: false
app_port: 7860
---

# AccessiCap Backend API

AI-powered image captioning backend for the AccessiCap Chrome extension.

Built with **FastAPI** + **BLIP** (Salesforce image captioning model) + optional translation.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API info |
| GET | `/health` | Server & model status |
| POST | `/caption` | Generate caption for a base64 image |
| GET | `/languages` | List supported languages |

## Usage

Send a POST to `/caption` with:
```json
{
  "imageData": "<base64 encoded image or data URL>",
  "language": "en"
}
```
