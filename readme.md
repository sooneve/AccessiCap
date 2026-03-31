# AccessiCap - Browser Extension for Accessible Web Browsing

<p align="center">
  <img src="icons/icon128.png" alt="AccessiCap Logo" width="128" height="128">
</p>

<p align="center">
  <strong>AI-Powered Accessibility Extension for Visually Impaired Users</strong>
</p>

<p align="center">
  Final Year Project | Version 2.0
</p>

---

## 🌟 Features

### 1. 🤖 Automatic Alt-Text Generation
- AI-powered image descriptions using BLIP (Bootstrapping Language-Image Pre-training)
- Automatically detects and processes images as you browse
- Context-aware understanding of image content

### 2. ⚡ Real-Time Processing
- Processes images as they load on the page
- MutationObserver detects dynamically loaded content
- Visual indicators show processing status

### 3. 🌐 Multilingual Language Support
- **12 Languages**: English, Hindi, Nepali, Spanish, French, German, Chinese, Japanese, Korean, Arabic, Russian, Portuguese
- AI captions translated to user's preferred language
- Language-specific TTS voices

### 4. 🔊 Text-to-Speech (TTS) Accessibility
- Click on any image to hear its description
- Right-click context menu to read selected text
- Customizable voice, speed, pitch, and volume
- Keyboard shortcut: `Alt + R` to read selection

### 5. ♿ Accessibility Features
- **High Contrast Mode**: Enhanced visibility
- **Dyslexia-Friendly Font**: OpenDyslexic font support
- **Reading Guide**: Line that follows your cursor
- **Visual Highlights**: Processed images are outlined

### 6. 🖱️ Browser-Level Integration
- Context menu options for images and text
- Keyboard shortcuts for quick access
- Badge notifications showing processed images
- Seamless Chrome/Edge integration

### 7. ⚙️ User-Customizable Settings
- Full options page with all settings
- Export/Import settings
- Per-session statistics
- Server status monitoring

---

## 📦 Installation

### Step 1: Clone or Download
```bash
git clone <repository-url>
# or download and extract the ZIP file
```

### Step 2: Install Backend Dependencies
```bash
cd backend
pip install -r requirements.txt
```

> **Note**: First-time setup will download the BLIP AI model (~1GB). This only happens once.

### Step 3: Load Extension in Browser

**For Chrome/Edge:**
1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the project folder (the one containing `manifest.json`)

### Step 4: Start the Backend Server
```bash
cd backend
python server.py
```

The server will start at `http://127.0.0.1:8001`

---

## ☁️ Deploy Backend to Cloud (Firebase/Google Cloud Run)

If you want the backend to run in the cloud, use **Google Cloud Run** (this can be managed from Firebase via Google Cloud integration).

> **Important**: Cloudinary is great for image storage/CDN, but it does **not** host Python APIs like this FastAPI server.

### Option A: Deploy with Cloud Run (recommended)

1. Build and push container:
```bash
cd backend
gcloud builds submit --tag gcr.io/<PROJECT_ID>/accessicap-api
```

2. Deploy service:
```bash
gcloud run deploy accessicap-api   --image gcr.io/<PROJECT_ID>/accessicap-api   --platform managed   --region us-central1   --allow-unauthenticated
```

3. Copy the Cloud Run URL and set it in your extension backend configuration.

### Option B: Firebase Hosting + Cloud Run
- Host extension docs/static pages on Firebase Hosting.
- Keep FastAPI backend on Cloud Run.
- Route calls from extension to your Cloud Run endpoint.

### Environment variables for cloud
- `HOST=0.0.0.0`
- `PORT=8080` (Cloud Run injects this automatically)
- `CORS_ORIGINS=https://your-extension-origin` (or `*` for testing)

---

## 🚀 Usage

### Quick Start
1. **Start the backend server** (see Step 4 above)
2. **Click the AccessiCap icon** in your browser toolbar
3. **Visit any website** with images
4. Images will be automatically processed and described!

### Using the Popup
- **Scan Page**: Click to manually scan all images
- **Test TTS**: Click to test text-to-speech
- **Toggle Settings**: Enable/disable features on the fly
- **View Stats**: See how many images were processed

### Context Menu (Right-Click)
- **On Images**: "Describe This Image" - Get AI description
- **On Selected Text**: "Read Selected Text" - TTS
- **On Page**: "Read Entire Page" - Read all text

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Alt + S` | Scan page for images |
| `Alt + R` | Read selected text aloud |

---

## 📁 Project Structure

```
accessicap/
├── manifest.json        # Extension configuration
├── popup.html           # Main popup interface
├── popup.js             # Popup functionality
├── content.js           # Content script (injected into pages)
├── background.js        # Background service worker
├── options.html         # Full settings page
├── options.js           # Settings functionality
├── styles.css           # Content script styles
├── icons/               # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── backend/             # Python backend server
│   ├── server.py        # FastAPI server
│   ├── requirements.txt # Python dependencies
│   └── Dockerfile       # Cloud Run container definition
└── README.md            # This file
```

---

## 🔧 Technical Architecture

### Frontend (Browser Extension)

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Extension                     │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Popup     │  │  Content    │  │   Background    │ │
│  │   (UI)      │  │  Script     │  │   Service       │ │
│  │             │  │  (Per Page) │  │   Worker        │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
│        │                │                   │           │
│        └────────────────┼───────────────────┘           │
│                         │                               │
│              Chrome Storage API                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Backend Server                         │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  FastAPI    │  │  BLIP       │  │  Google         │ │
│  │  Server     │  │  AI Model   │  │  Translate      │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Content Script** detects images on the page
2. Images are converted to Base64 and sent to **Background Script**
3. **Background Script** forwards to **Backend API**
4. **BLIP Model** generates English caption
5. Caption is translated to user's language (if needed)
6. Caption is returned and displayed on the image
7. User can **click** to hear TTS or **hover** to see tooltip

---

## 🛠️ API Endpoints

### `GET /health`
Check server status and model availability.

**Response:**
```json
{
  "status": "healthy",
  "models_loaded": true,
  "message": "Server is running and models are loaded"
}
```

### `POST /caption`
Generate caption for an image.

**Request:**
```json
{
  "imageData": "base64_encoded_image_data",
  "language": "en"
}
```

**Response:**
```json
{
  "caption": "A cat sitting on a windowsill looking outside",
  "language": "en"
}
```

---

## 📸 Screenshots

### Extension Popup
The main control panel accessible from the browser toolbar.

### Options Page
Full settings page with all customization options.

### Image Processing
Images are highlighted and show tooltips with AI descriptions.

---

## 🔬 Technologies Used

### Frontend
- **Manifest V3** - Latest Chrome extension standard
- **JavaScript ES6+** - Modern JavaScript features
- **CSS3** - Animations, gradients, glassmorphism
- **Chrome APIs** - Storage, TTS, Context Menus, Scripting

### Backend
- **FastAPI** - Modern Python web framework
- **BLIP** - Salesforce's image captioning AI model
- **Transformers** - Hugging Face library
- **PyTorch** - Deep learning framework
- **Google Translate** - Translation API

---

## 📋 Requirements

### System Requirements
- **OS**: Windows 10/11, macOS, Linux
- **Browser**: Chrome 88+, Edge 88+
- **Python**: 3.8 or higher
- **RAM**: 4GB minimum (8GB recommended)
- **Disk**: 2GB for AI model cache

### Python Dependencies
```
fastapi>=0.104.0
uvicorn>=0.24.0
transformers>=4.35.0
torch>=2.0.0
torchvision>=0.15.0
pillow>=10.0.0
googletrans==4.0.0-rc1
pydantic>=2.0.0
```

---

## 🐛 Troubleshooting

### Server Not Connecting
1. Ensure the backend server is running: `python backend/server.py`
2. Check if port 8001 is available
3. Look for error messages in the terminal

### Images Not Processing
1. Verify server status in popup (green dot = online)
2. Make sure images are large enough (>50x50 pixels)
3. Some images may be protected by CORS policies

### TTS Not Working
1. Check if TTS is enabled in settings
2. Try a different language
3. Ensure browser has TTS permissions

### Extension Not Loading
1. Make sure Developer Mode is enabled
2. Check for errors in `chrome://extensions/`
3. Reload the extension

---

## 🎓 For Final Year Project Demonstration

### Key Technical Highlights

1. **Browser Extension Development**
   - Manifest V3 architecture
   - Service workers and content scripts
   - Chrome APIs integration

2. **AI/ML Integration**
   - BLIP vision-language model
   - Real-time image processing
   - Multi-language translation

3. **Accessibility Implementation**
   - WCAG compliance features
   - Screen reader compatibility
   - Multiple accessibility modes

4. **User Experience Design**
   - Modern, responsive UI
   - Real-time feedback
   - Customizable settings

5. **Full-Stack Development**
   - Frontend (Extension)
   - Backend (FastAPI)
   - API design and integration

---

## 📝 License

This project is developed for educational purposes as a Final Year Project.

---

## 🙏 Acknowledgments

- **Salesforce Research** - BLIP Model
- **Hugging Face** - Transformers Library
- **FastAPI** - Modern Python Framework
- **Google** - Translation API

---

<p align="center">
  Made with ❤️ for Accessible Web Browsing
</p>