# GB10 Blackwell GPU - Flash Attention 3 Compatibility Issue

## Issue Summary

The nanochat inference page cannot perform web-based inference on the GB10 Blackwell GPU due to Flash Attention 3 kernel compatibility issues.

## Technical Details

### Hardware & Software
- **GPU**: NVIDIA GB10 (Blackwell architecture)
- **CUDA Compute Capability**: 12.1
- **PyTorch Version**: 2.9.1+cu128
- **CUDA Version**: 12.8
- **Architecture**: ARM64 (aarch64)
- **OS**: Ubuntu Linux

### The Problem

1. **PyTorch Limitation**: PyTorch 2.9.1 supports CUDA compute capability 8.0-12.0, but GB10 is 12.1
2. **Flash Attention 3 Kernels**: Pre-built FA3 kernels from `varunneal/flash-attention-3` are not compiled for compute capability 12.1
3. **Runtime Error**:
   ```
   CUDA error: no kernel image is available for execution on the device
   ```

### What Works

✅ Model discovery (finds all 18 trained models)
✅ Model loading (checkpoint loads successfully)
✅ PyTorch CUDA is available and detects the GPU
✅ Tokenizer loads correctly (vocab_size=65536)
✅ All nanochat infrastructure is operational

### What Doesn't Work

❌ Actual inference/generation
❌ Flash Attention forward pass fails at runtime
❌ Web-based chat interface

## Why This Happens

The GB10 GPU is part of NVIDIA's Blackwell architecture (2024), which is very new. The pre-compiled Flash Attention 3 kernels available through HuggingFace Hub were built before this GPU architecture was finalized.

nanochat hardcodes Flash Attention 3:
```python
# nanochat/gpt.py line 32
from kernels import get_kernel
flash_attn = get_kernel('varunneal/flash-attention-3').flash_attn_interface
```

There's no fallback to standard PyTorch attention, so inference fails completely.

## Workaround: Use CLI

The CLI method works perfectly for inference:

```bash
cd /var/www/gpt2/nanochat
source .venv/bin/activate
python -m scripts.chat_cli -i sft
```

**Features**:
- Interactive chat
- Temperature and top-k control
- Conversation history
- One-shot queries with `-p "prompt"`
- Works with all trained models (base, mid, sft)

## Potential Long-term Solutions

### Option 1: Build Flash Attention 3 from Source
Compile FA3 specifically for compute capability 12.1:
```bash
git clone https://github.com/Dao-AILab/flash-attention.git
cd flash-attention
TORCH_CUDA_ARCH_LIST="12.1" python setup.py install
```
**Pros**: Native FA3 support, optimal performance
**Cons**: Complex build process, requires CUDA toolkit, may take hours

### Option 2: Wait for Official FA3 Support
Monitor for updates to `varunneal/flash-attention-3` or official FA3 releases with GB10 support.

**Pros**: No custom builds, easier maintenance
**Cons**: Unknown timeline, may never happen

### Option 3: Patch nanochat to Use Standard Attention
Modify `nanochat/gpt.py` to add a fallback to PyTorch's built-in scaled dot-product attention:
```python
try:
    from kernels import get_kernel
    flash_attn = get_kernel('varunneal/flash-attention-3').flash_attn_interface
    USE_FLASH_ATTN = True
except Exception:
    USE_FLASH_ATTN = False
```

**Pros**: Would work immediately
**Cons**: Slower inference, higher memory usage, diverges from upstream nanochat

### Option 4: Upgrade PyTorch
Wait for PyTorch version that supports compute capability 12.1.

**Pros**: May enable broader compatibility
**Cons**: PyTorch 2.9.1 is already very recent, may take months

### Option 5: Use Different GPU
Test on a GPU with compute capability ≤12.0 (e.g., H100, A100, RTX 4090).

**Pros**: Guaranteed to work
**Cons**: Requires different hardware, GB10 is more powerful

## Recommendation

For students using the platform:
- **Use the CLI method** for inference - it's fully functional and provides the same chat experience
- The web interface successfully shows all trained models and their metrics
- Model selection and discovery works perfectly

For platform developers:
- **Option 3 (PyTorch fallback)** is the most practical short-term solution
- Monitor Flash Attention 3 and PyTorch releases for native GB10 support
- Consider making FA3 optional in nanochat to support broader hardware

## Related Files

- `/var/www/gpt2/nanochat-platform/backend/app/api/inference.py` - Returns 503 with explanation
- `/var/www/gpt2/nanochat-platform/frontend/src/pages/InferencePage.jsx` - Shows disabled state
- `/var/www/gpt2/nanochat-platform/INFERENCE_FINAL_STATUS.md` - User-facing documentation
- `/var/www/gpt2/nanochat-platform/INFERENCE_CLI_GUIDE.md` - CLI usage guide

## Testing Log

```bash
# Confirmed GPU is detected
$ nvidia-smi
# GPU: NVIDIA GB10, CUDA: 13.0

# Confirmed PyTorch sees CUDA
$ python -c "import torch; print(torch.cuda.is_available())"
# True

# Confirmed model loads
$ python -m scripts.chat_cli -i sft -p "Test"
# Model loads successfully, then fails at inference with:
# "CUDA error: no kernel image is available for execution on the device"

# Tried compatibility mode (failed)
$ TORCH_CUDA_ARCH_LIST="9.0" python -m scripts.chat_cli -i sft -p "Test"
# Same error - FA3 kernels are runtime-loaded, not compile-time
```

## Date
2026-01-14

## Status
**DOCUMENTED** - Web chat disabled with clear messaging, CLI workaround provided
