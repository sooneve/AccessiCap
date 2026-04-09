"""
convert_blip_to_onnx.py
Exports the BLIP *vision encoder* to ONNX and quantizes it.

Why only the encoder?
  The full BLIP model is an encoder-decoder with auto-regressive text
  generation. torch.onnx cannot trace a generation loop automatically, so
  we only export the heavy ViT image-encoder. The text decoder continues to
  run in PyTorch (it is tiny by comparison). The image encoder represents
  the vast majority of inference time, so this still yields a meaningful
  speed-up.

Outputs:
  blip_encoder.onnx             – full-precision encoder
  blip_encoder_quantized.onnx   – INT8 quantized encoder (used at runtime)
"""

import torch
from transformers import BlipProcessor, BlipForConditionalGeneration
from onnxruntime.quantization import quantize_dynamic, QuantType

MODEL_NAME = "Salesforce/blip-image-captioning-base"
ONNX_PATH = "blip_encoder.onnx"
QUANTIZED_PATH = "blip_encoder_quantized.onnx"


# ── 1. Load model ────────────────────────────────────────────────────────────
print(f"Loading {MODEL_NAME} ...")
processor = BlipProcessor.from_pretrained(MODEL_NAME)
model = BlipForConditionalGeneration.from_pretrained(MODEL_NAME)
model.eval()

vision_encoder = model.vision_model  # standalone ViT encoder


# ── 2. Wrap encoder to return only last_hidden_state ─────────────────────────
class VisionEncoderWrapper(torch.nn.Module):
    def __init__(self, encoder):
        super().__init__()
        self.encoder = encoder

    def forward(self, pixel_values):
        outputs = self.encoder(pixel_values=pixel_values)
        return outputs.last_hidden_state


wrapped = VisionEncoderWrapper(vision_encoder)
wrapped.eval()

dummy_pixel_values = torch.randn(1, 3, 384, 384)


# ── 3. Export to ONNX ────────────────────────────────────────────────────────
print("Exporting vision encoder to ONNX ...")
torch.onnx.export(
    wrapped,
    dummy_pixel_values,
    ONNX_PATH,
    input_names=["pixel_values"],
    output_names=["last_hidden_state"],
    dynamic_axes={
        "pixel_values":     {0: "batch_size"},
        "last_hidden_state": {0: "batch_size"},
    },
    opset_version=14,
)
print(f"  Saved -> {ONNX_PATH}")


# ── 4. Quantize ──────────────────────────────────────────────────────────────
print("Quantizing to INT8 ...")
quantize_dynamic(ONNX_PATH, QUANTIZED_PATH, weight_type=QuantType.QInt8)
print(f"  Saved -> {QUANTIZED_PATH}")

print("\nDone! Files created:")
print(f"  {ONNX_PATH}")
print(f"  {QUANTIZED_PATH}")
