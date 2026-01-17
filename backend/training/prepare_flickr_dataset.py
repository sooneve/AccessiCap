"""
Convert Flickr8k CSV format to AccessiCap JSON format
Run this script to prepare your dataset for training.

Usage:
    python prepare_flickr_dataset.py
"""

import json
import csv
from pathlib import Path
import random

def main():
    dataset_dir = Path(__file__).parent / "dataset"
    captions_file = dataset_dir / "captions" / "captions.txt"
    images_dir = dataset_dir / "images" / "Images"
    output_file = dataset_dir / "captions.json"
    
    print("=" * 60)
    print("  Flickr8k Dataset Converter for AccessiCap")
    print("=" * 60)
    
    print(f"\nReading captions from: {captions_file}")
    
    image_captions = {}
    
    with open(captions_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)  
        
        for row in reader:
            if len(row) >= 2:
                image_name = row[0].strip()
                caption = row[1].strip()
                
                if image_name not in image_captions:
                    image_captions[image_name] = []
                image_captions[image_name].append(caption)
    
    print(f"Found {len(image_captions)} unique images")
    

    json_data = []
    missing_images = 0
    
    for image_name, captions in image_captions.items():
        image_path = images_dir / image_name
        
        if image_path.exists():

            best_caption = max(captions, key=len)
            

            best_caption = best_caption.strip()
            if best_caption.endswith('.'):
                best_caption = best_caption[:-1] 
            
            json_data.append({
                "image": f"images/Images/{image_name}",
                "caption": best_caption
            })
        else:
            missing_images += 1
    
    print(f"Found {len(json_data)} images with captions")
    if missing_images > 0:
        print(f"Warning: {missing_images} images not found in images folder")
    

    random.shuffle(json_data)
    

    print(f"\nSaving to: {output_file}")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)
    
    print(f"\nCreated {output_file.name} with {len(json_data)} image-caption pairs")
    

    print("\nSample captions:")
    print("-" * 60)
    for item in json_data[:3]:
        print(f"Image: {item['image']}")
        print(f"Caption: {item['caption']}")
        print("-" * 60)
    
    print("\nYou can now run training with:")
    print("   python train_blip.py --dataset_path ./dataset --use_lora --epochs 10")

if __name__ == "__main__":
    main()
