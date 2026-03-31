# AccessiCap - AI Model Training

This folder contains everything you need to train your own custom BLIP model for better accessibility descriptions.

## 📁 Contents

```
training/
├── train_blip.py              # Main training script
├── use_finetuned_model.py     # Test your trained model
├── training_requirements.txt   # Python dependencies for training
└── dataset/                    # Your training data
    ├── images/                 # Put your images here
    ├── captions/               # Put matching captions here
    └── README.md               # Dataset format guide
```

## 🚀 Quick Start

### 1. Install Training Dependencies

```bash
cd backend/training
pip install -r training_requirements.txt
```

### 2. Prepare Your Dataset

Add your images and captions to the `dataset/` folder. See `dataset/README.md` for format details.

**Minimum recommended: 100+ image-caption pairs**

### 3. Train the Model

#### Option A: LoRA Training (Recommended)
- Uses less GPU memory (~4-6GB)
- Faster training
- Smaller saved model

```bash
python train_blip.py --dataset_path ./dataset --use_lora --epochs 10
```

#### Option B: Full Fine-Tuning
- Requires more GPU memory (~8-16GB)
- Slower but potentially better results

```bash
python train_blip.py --dataset_path ./dataset --epochs 5 --batch_size 2
```

### 4. Test Your Model

```bash
# Single image
python use_finetuned_model.py --model_path ./models/blip-lora --image ./test.jpg --use_lora

# Interactive mode
python use_finetuned_model.py --model_path ./models/blip-lora --use_lora --interactive
```

### 5. Use in AccessiCap

Update `server.py` to load your fine-tuned model:

```python
# Change this line:
processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")

# To this:
processor = BlipProcessor.from_pretrained("./training/models/blip-lora")
model = BlipForConditionalGeneration.from_pretrained("./training/models/blip-lora")
```

## ⚙️ Training Options

| Option | Description | Default |
|--------|-------------|---------|
| `--dataset_path` | Path to dataset folder | `./dataset` |
| `--output_dir` | Where to save trained model | `./models` |
| `--epochs` | Number of training epochs | `5` |
| `--batch_size` | Batch size (lower = less memory) | `4` |
| `--use_lora` | Use LoRA for efficient training | `False` |
| `--learning_rate` | Learning rate | `5e-5` |

## 💻 Hardware Requirements

| Training Type | GPU Memory | Time (1000 images) |
|--------------|------------|-------------------|
| LoRA | 4-6 GB | ~1-2 hours |
| Full Fine-Tune | 8-16 GB | ~3-5 hours |
| CPU Only | N/A | 10+ hours (not recommended) |

## 📊 Monitoring Training

Training logs are saved to `./models/blip-lora/logs/`. View with TensorBoard:

```bash
tensorboard --logdir ./models/blip-lora/logs
```

## 🎯 Tips for Better Results

1. **Quality captions matter more than quantity**
2. **Be consistent** in your caption style
3. **Include diverse images** that represent what you'll encounter
4. **Start with LoRA** - it's faster and uses less memory
5. **Increase epochs gradually** - start with 5, then try 10

## 🔧 Troubleshooting

### Out of Memory Error
- Reduce `--batch_size` to 1 or 2
- Use `--use_lora` flag
- Close other GPU applications

### Training is Slow
- Make sure you're using GPU: `torch.cuda.is_available()` should return `True`
- Install CUDA if not available

### Model Doesn't Improve
- Check your captions are descriptive
- Try more training epochs
- Increase dataset size
