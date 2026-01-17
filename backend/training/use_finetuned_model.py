"""
AccessiCap - Use Fine-Tuned Model
Load and use your custom-trained BLIP model for inference.

Usage:
    python use_finetuned_model.py --model_path ./models/blip-lora --image ./test.jpg
"""

import argparse
from pathlib import Path
from PIL import Image
import torch
from transformers import BlipProcessor, BlipForConditionalGeneration

try:
    from peft import PeftModel
    PEFT_AVAILABLE = True
except ImportError:
    PEFT_AVAILABLE = False


def load_model(model_path, use_lora=False):
    """Load the fine-tuned model"""
    model_path = Path(model_path)
    
    if use_lora and PEFT_AVAILABLE:
        print("Loading base model...")
        processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
        base_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
        
        print(f"Loading LoRA adapters from {model_path}...")
        model = PeftModel.from_pretrained(base_model, model_path)
        model = model.merge_and_unload()  
    else:
        print(f"Loading fine-tuned model from {model_path}...")
        processor = BlipProcessor.from_pretrained(model_path)
        model = BlipForConditionalGeneration.from_pretrained(model_path)
    
    return processor, model


def generate_caption(image_path, processor, model, device):
    """Generate a caption for an image"""
    image = Image.open(image_path).convert("RGB")
    
    inputs = processor(image, return_tensors="pt").to(device)
    
    with torch.no_grad():
        output = model.generate(**inputs, max_new_tokens=100)
    
    caption = processor.decode(output[0], skip_special_tokens=True)
    return caption


def interactive_mode(processor, model, device):
    """Interactive mode for testing multiple images"""
    print("\n" + "="*60)
    print("  Interactive Caption Generator")
    print("  Type 'quit' to exit")
    print("="*60 + "\n")
    
    while True:
        image_path = input("\nEnter image path (or 'quit'): ").strip()
        
        if image_path.lower() == 'quit':
            break
        
        if not Path(image_path).exists():
            print(f"❌ File not found: {image_path}")
            continue
        
        try:
            caption = generate_caption(image_path, processor, model, device)
            print(f"\n📝 Caption: {caption}")
        except Exception as e:
            print(f"❌ Error: {e}")


def main():
    parser = argparse.ArgumentParser(description="Use fine-tuned BLIP model")
    
    parser.add_argument(
        "--model_path",
        type=str,
        required=True,
        help="Path to the fine-tuned model directory"
    )
    parser.add_argument(
        "--image",
        type=str,
        default=None,
        help="Path to an image to caption"
    )
    parser.add_argument(
        "--use_lora",
        action="store_true",
        help="Indicate if the model uses LoRA adapters"
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Run in interactive mode"
    )
    
    args = parser.parse_args()
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    
    processor, model = load_model(args.model_path, args.use_lora)
    model = model.to(device)
    model.eval()
    
    print("✅ Model loaded successfully!")
    
    if args.interactive:
        interactive_mode(processor, model, device)
    elif args.image:
        caption = generate_caption(args.image, processor, model, device)
        print(f"\n📝 Caption: {caption}")
    else:
        print("\nNo image provided. Use --image or --interactive")


if __name__ == "__main__":
    main()
