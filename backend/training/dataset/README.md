# AccessiCap Training Dataset
#Custom training data for BLIP model.

## 📁 Folder Structure

```
dataset/
├── images/           #training images
│   ├── image001.jpg
│   ├── image002.png
│   └── ...
├── captions/         # Matching caption files
│   ├── image001.txt  # Caption for image001.jpg
│   ├── image002.txt  # Caption for image002.png
│   └── ...
├── captions.json     # Alternative: all captions in one file
└── README.md         
```

## 📝 Two Ways to Organize Data

### Option 1: Separate Files (for small datasets)

1. Put images in the `images/` folder
2. Create a `.txt` file for each image in `captions/`
3. The text file name must match the image name (without extension)

**Example:**
- `images/cat_sleeping.jpg`
- `captions/cat_sleeping.txt` containing: `A fluffy orange cat sleeping peacefully on a blue couch`

### Option 2: JSON File (for large datasets)

Create a `captions.json` file in this folder:

```json
[
  {
    "image": "images/cat_sleeping.jpg",
    "caption": "A fluffy orange cat sleeping peacefully on a blue couch"
  },
  {
    "image": "images/person_working.png",
    "caption": "A person wearing glasses typing on a laptop computer in a coffee shop"
  }
]
```

## ✍️ Writing Good Accessibility Captions

For accessibility purposes, your captions should be:

### ✅ DO:
- **Be descriptive**: Include colors, positions, actions, emotions
- **Mention people**: Describe what they're doing, wearing, expressions
- **Include context**: Location, time of day, setting
- **Note text in images**: Signs, labels, written text

### ❌ DON'T:
- Use vague descriptions like "a picture" or "an image of"
- Start with "This is..." or "This shows..."
- Include irrelevant details
- Use overly technical terms

### 📋 Examples:

| Image | Bad Caption | Good Caption |
|-------|-------------|--------------|
| Person at computer | A person | A young woman with brown hair typing on a silver laptop at a wooden desk |
| Sunset photo | Sunset | A vibrant orange and pink sunset over a calm ocean with silhouettes of palm trees |
| Dog playing | A dog | A golden retriever puppy jumping to catch a red frisbee in a grassy park |

## 📊 Recommended Dataset Size

| Size | Quality | Training Time |
|------|---------|---------------|
| 100-500 images | Basic | 30 min - 2 hours |
| 500-2000 images | Good | 2-8 hours |
| 2000+ images | Best | 8+ hours |

## 🚀 Start Training

Once you've added your images and captions:

```bash
cd backend/training

# Standard fine-tuning (requires more GPU memory)
python train_blip.py --dataset_path ./dataset --epochs 5

# LoRA fine-tuning (recommended, uses less memory)
python train_blip.py --dataset_path ./dataset --use_lora --epochs 10
```

## 💡 Tips

1. **Quality over quantity**: 100 well-captioned images > 1000 poor captions
2. **Diverse images**: Include various types of images you want to describe
3. **Consistent style**: Use a consistent caption style throughout
4. **Proofread**: Spelling and grammar matter!
