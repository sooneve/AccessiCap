"""
AccessiCap - BLIP Fine-Tuning Script
Train the BLIP model on your own image-caption dataset for better accessibility descriptions.

Requirements:
    pip install -r training_requirements.txt

Usage:
    python train_blip.py --dataset_path ./dataset --epochs 5 --batch_size 4

For LoRA (lightweight) training:
    python train_blip.py --dataset_path ./dataset --use_lora --epochs 10
"""

import os
import json
import argparse
from pathlib import Path
import torch
from torch.utils.data import Dataset, DataLoader
from PIL import Image
from transformers import (
    BlipProcessor, 
    BlipForConditionalGeneration,
    TrainingArguments,
    Trainer
)

try:
    from peft import LoraConfig, get_peft_model, TaskType
    PEFT_AVAILABLE = True
except ImportError:
    PEFT_AVAILABLE = False
    print("Warning: PEFT not installed. LoRA training disabled.")
    print("Install with: pip install peft")


class ImageCaptionDataset(Dataset):
    """Dataset for image-caption pairs"""
    
    def __init__(self, dataset_path, processor, max_length=128):
        self.processor = processor
        self.max_length = max_length
        self.dataset_path = Path(dataset_path)
        self.data = []
        
        json_path = Path(dataset_path) / "captions.json"
        if json_path.exists():
            with open(json_path, 'r', encoding='utf-8') as f:
                self.data = json.load(f)
        else:

            images_dir = Path(dataset_path) / "images"
            captions_dir = Path(dataset_path) / "captions"
            
            if images_dir.exists():
                for img_file in images_dir.glob("*"):
                    if img_file.suffix.lower() in ['.jpg', '.jpeg', '.png', '.webp']:
                        caption_file = captions_dir / f"{img_file.stem}.txt"
                        if caption_file.exists():
                            with open(caption_file, 'r', encoding='utf-8') as f:
                                caption = f.read().strip()
                            self.data.append({
                                "image": str(img_file),
                                "caption": caption
                            })
        
        print(f"Loaded {len(self.data)} image-caption pairs")
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        item = self.data[idx]
        
        image_path = self.dataset_path / item["image"]
        image = Image.open(image_path).convert("RGB")
        caption = item["caption"]
        
        encoding = self.processor(
            images=image,
            text=caption,
            padding="max_length",
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt"
        )
        
        encoding = {k: v.squeeze(0) for k, v in encoding.items()}
        encoding["labels"] = encoding["input_ids"].clone()
        
        return encoding


def create_lora_model(model):
    """Apply LoRA adapters to the model for efficient fine-tuning"""
    if not PEFT_AVAILABLE:
        raise ImportError("PEFT is required for LoRA training. Install with: pip install peft")
    
    lora_config = LoraConfig(
        r=16,  
        lora_alpha=32, 
        lora_dropout=0.1,
        target_modules=["q_proj", "v_proj", "k_proj", "out_proj", "fc1", "fc2"],
        bias="none"
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    return model


def train(args):
    """Main training function"""
    print("\n" + "="*60)
    print("  AccessiCap - BLIP Fine-Tuning")
    print("="*60)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nUsing device: {device}")
    
    if device.type == "cpu":
        print("Warning: Training on CPU is very slow. GPU recommended.")

    print("\nLoading BLIP model...")
    processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
    model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
    
    if args.use_lora:
        print("\nApplying LoRA adapters for efficient fine-tuning...")
        model = create_lora_model(model)
    
    model.to(device)
    
    print(f"\nLoading dataset from: {args.dataset_path}")
    dataset = ImageCaptionDataset(args.dataset_path, processor)
    
    if len(dataset) == 0:
        print("Error: No data found in dataset!")
        print("Please create a dataset following the format in dataset/README.md")
        return
    
    train_size = int(0.9 * len(dataset))
    val_size = len(dataset) - train_size
    train_dataset, val_dataset = torch.utils.data.random_split(dataset, [train_size, val_size])
    
    print(f"Training samples: {train_size}")
    print(f"Validation samples: {val_size}")
    
    output_dir = Path(args.output_dir) / ("blip-lora" if args.use_lora else "blip-finetuned")
    
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        warmup_steps=100,
        weight_decay=0.01,
        logging_dir=str(output_dir / "logs"),
        logging_steps=10,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=False,
        push_to_hub=False,
        report_to="none",
        fp16=torch.cuda.is_available(), 
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
    )
    
    print("\n" + "="*60)
    print("  Starting Training...")
    print("="*60 + "\n")
    
    trainer.train()
    
    print(f"\nSaving model to: {output_dir}")
    
    if args.use_lora:
        model.save_pretrained(output_dir)
    else:
        trainer.save_model(output_dir)
    
    processor.save_pretrained(output_dir)
    
    print("\n" + "="*60)
    print("  Training Complete!")
    print("="*60)
    print(f"\nModel saved to: {output_dir}")
    print("\nTo use the fine-tuned model, update server.py to load from:")
    print(f'  processor = BlipProcessor.from_pretrained("{output_dir}")')
    print(f'  model = BlipForConditionalGeneration.from_pretrained("{output_dir}")')


def main():
    parser = argparse.ArgumentParser(description="Fine-tune BLIP for AccessiCap")
    
    parser.add_argument(
        "--dataset_path", 
        type=str, 
        default="./dataset",
        help="Path to the dataset directory"
    )
    parser.add_argument(
        "--output_dir", 
        type=str, 
        default="./models",
        help="Directory to save the trained model"
    )
    parser.add_argument(
        "--epochs", 
        type=int, 
        default=5,
        help="Number of training epochs"
    )
    parser.add_argument(
        "--batch_size", 
        type=int, 
        default=4,
        help="Batch size for training"
    )
    parser.add_argument(
        "--use_lora", 
        action="store_true",
        help="Use LoRA for efficient fine-tuning (recommended)"
    )
    parser.add_argument(
        "--learning_rate", 
        type=float, 
        default=5e-5,
        help="Learning rate"
    )
    
    args = parser.parse_args()
    
    train(args)


if __name__ == "__main__":
    main()
