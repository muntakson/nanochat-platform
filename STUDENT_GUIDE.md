# 🎓 NanoChat Platform - Student Guide

Welcome to the NanoChat Platform! This guide will help you get started with training your own GPT models.

## 🌐 Getting Started

**Platform URL**: https://gpt2.iotok.org

### Step 1: Create Your Account

1. Visit https://gpt2.iotok.org
2. Click **"Register here"**
3. Fill in:
   - **Username**: Choose a unique username
   - **Email**: Your email address
   - **Password**: Create a secure password
4. Click **"Register"**

You'll be automatically logged in!

### Step 2: Create Your First Project

Projects help you organize your work.

1. On the dashboard, click **"+ New Project"**
2. Enter a name like "My First NanoChat Model"
3. Add a description (optional)
4. Click **"Create"**

### Step 3: Create a Notebook

Notebooks are where you write and run code.

1. Inside your project, click **"+ New Notebook"**
2. Name it something like "Training Experiments"
3. Click **"Create"**

You'll see a Jupyter-style interface with code cells!

## 📝 Writing Your First Code

### Example 1: Test NanoChat Installation

Click in the first cell and type:

```python
# Welcome to NanoChat!
import sys
import torch

print(f"Python version: {sys.version}")
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")

# Test nanochat
from nanochat.tokenizer import Tokenizer
tokenizer = Tokenizer()
print(f"\n✅ NanoChat ready!")
print(f"Tokenizer vocab size: {tokenizer.vocab_size}")
```

Click **"▶ Run"** to execute!

### Example 2: Tokenize Text

Add another cell (click **"+ Add Cell"**):

```python
from nanochat.tokenizer import Tokenizer

# Initialize tokenizer
tokenizer = Tokenizer()

# Encode some text
text = "Hello! I'm learning to train GPT models with NanoChat."
tokens = tokenizer.encode(text)

print(f"Original text: {text}")
print(f"Number of tokens: {len(tokens)}")
print(f"Token IDs: {tokens}")
print(f"\nDecoded back: {tokenizer.decode(tokens)}")
```

### Example 3: Load and Explore a Trained Model

```python
import torch
from nanochat.checkpoint_manager import load_model
from nanochat.engine import Engine

# Set device
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"Using device: {device}")

# Load a model (if available)
# You need to have trained a model first!
try:
    model, tokenizer, meta = load_model('sft', device, phase='eval')
    print("\n✅ Model loaded successfully!")
    print(f"Model type: {type(model)}")
    print(f"Parameters: {sum(p.numel() for p in model.parameters()):,}")
except Exception as e:
    print(f"No trained model found yet. Train one first!")
    print(f"Error: {e}")
```

## 🚀 Training Your First Model

### Quick Training (Speedrun)

This trains a small model in about 4 hours on GPU:

```python
# Note: Run this in a terminal, not in a notebook cell
# as it takes hours to complete

import subprocess
import os

# Change to nanochat directory
os.chdir('/var/www/gpt2/nanochat')

# Run speedrun script
subprocess.run(['bash', 'speedrun.sh'])
```

**Better approach**: Run training in a separate terminal session:

```bash
# SSH into the server
cd /var/www/gpt2/nanochat
source .venv/bin/activate

# Run in screen (recommended)
screen -S training
bash speedrun.sh

# Detach with Ctrl+A then D
# Reattach later with: screen -r training
```

### Monitor Training Progress

While training runs, you can monitor it:

```python
import os
import glob

# Find training logs
log_files = glob.glob('/var/www/gpt2/nanochat/*.log')
for log in log_files:
    print(f"Log file: {log}")

# Check for checkpoints
checkpoint_dir = os.path.expanduser('~/.cache/nanochat')
if os.path.exists(checkpoint_dir):
    print(f"\nCheckpoints directory: {checkpoint_dir}")
    for root, dirs, files in os.walk(checkpoint_dir):
        if files:
            print(f"{root}: {len(files)} files")
```

## 🎯 Common Tasks

### Task 1: Check Available Models

```python
from pathlib import Path
import os

checkpoint_base = Path.home() / ".cache" / "nanochat"

if checkpoint_base.exists():
    print("Available model checkpoints:\n")

    for checkpoint_type in ["base_checkpoints", "mid_checkpoints", "chatsft_checkpoints"]:
        checkpoint_dir = checkpoint_base / checkpoint_type
        if checkpoint_dir.exists():
            models = list(checkpoint_dir.iterdir())
            print(f"{checkpoint_type}:")
            for model_dir in models:
                if model_dir.is_dir():
                    model_files = list(model_dir.glob("model_*.pt"))
                    print(f"  - {model_dir.name}: {len(model_files)} checkpoints")
            print()
else:
    print("No checkpoints found yet. Train a model first!")
```

### Task 2: Generate Text with Your Model

```python
import torch
from nanochat.checkpoint_manager import load_model
from nanochat.engine import Engine

# Load your trained model
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model, tokenizer, meta = load_model('sft', device, phase='eval')

# Create engine
engine = Engine(model, tokenizer)

# Prepare prompt
prompt = "Once upon a time, in a land far away,"
prompt_tokens = tokenizer.encode(prompt)

# Add special tokens for chat format
bos = tokenizer.get_bos_token_id()
user_start = tokenizer.encode_special("<|user_start|>")
user_end = tokenizer.encode_special("<|user_end|>")
assistant_start = tokenizer.encode_special("<|assistant_start|>")

# Build conversation
tokens = [bos, user_start]
tokens.extend(prompt_tokens)
tokens.extend([user_end, assistant_start])

# Generate
print(f"Prompt: {prompt}")
print("\nGenerated text:")

with torch.amp.autocast(device_type='cuda', dtype=torch.bfloat16):
    for token_column, _ in engine.generate(
        tokens,
        num_samples=1,
        max_tokens=100,
        temperature=0.8,
        top_k=50
    ):
        token = token_column[0]
        token_text = tokenizer.decode([token])
        print(token_text, end='', flush=True)
```

### Task 3: Evaluate Your Model

```python
# Run evaluation scripts
import subprocess
import os

os.chdir('/var/www/gpt2/nanochat')

# Evaluate on CORE benchmark
subprocess.run([
    'python', '-m', 'scripts.base_eval',
    '--model-tag', 'your_model_name'
])
```

## 💡 Tips and Best Practices

### 1. Organizing Your Work

- **One project per experiment**: e.g., "Baseline Training", "Custom Dataset", "Fine-tuning Tests"
- **Multiple notebooks per project**: e.g., "Data Exploration", "Training", "Evaluation", "Inference"
- **Add descriptions**: Help yourself remember what each project/notebook does

### 2. Saving Your Work

- Click **"💾 Save"** button regularly
- The platform auto-saves, but manual saves ensure nothing is lost
- All notebooks are saved to the database

### 3. Running Long Operations

For operations that take a long time (training, evaluation):
- Use terminal/SSH instead of notebook cells
- Run in `screen` or `tmux` sessions
- Monitor progress through log files

### 4. Working with Large Outputs

If a cell produces lots of output:
- Click **"🗑️ Clear All Output"** to clean up
- Consider writing output to files instead
- Use `tail` to show only recent lines

### 5. Code Cell Management

- Click **"+ Add Cell"** to create new cells
- Click **"🗑️"** on a cell to delete it
- Run cells in any order (they're independent)
- Use **"▶️ Run All"** to execute all cells sequentially

## 📚 Learning Resources

### NanoChat Documentation

Located at `/var/www/gpt2/nanochat/`:
- **README.md**: Main documentation
- **speedrun.sh**: Training script
- **scripts/**: Various utility scripts
- **tasks/**: Evaluation tasks

### Example Training Commands

```bash
# Quick speedrun (4 hours, $100)
bash speedrun.sh

# Longer training (12 hours, $300)
bash run1000.sh

# Custom training
python -m scripts.base_train --depth=20 --device-batch-size=32
```

### Getting Help

1. **API Documentation**: https://gpt2.iotok.org/docs
2. **NanoChat GitHub**: https://github.com/karpathy/nanochat
3. **Ask in notebook**: Use print statements to debug
4. **Check logs**: Look in `/var/www/gpt2/nanochat/*.log`

## 🎓 Assignment Ideas

### Beginner
1. **Tokenizer Exploration**: Test tokenization on different text types
2. **Model Inspection**: Load a trained model and examine its architecture
3. **Text Generation**: Generate completions for various prompts

### Intermediate
4. **Training Monitoring**: Write code to track training progress
5. **Evaluation**: Run benchmark tests on trained models
6. **Comparison**: Compare different model checkpoints

### Advanced
7. **Custom Training**: Modify training scripts for experiments
8. **Fine-tuning**: Fine-tune on custom datasets
9. **Full Pipeline**: Train, evaluate, and deploy your own model

## 🛠️ Troubleshooting

### "Module not found" errors

Make sure you're using the nanochat environment:
```python
import sys
print(sys.executable)  # Should show nanochat's Python path
```

### Cell won't run

- Check if another cell is still running (look for spinning indicator)
- Try refreshing the page
- Click "Stop" if a cell is stuck

### Lost work?

Don't worry! All notebooks are saved to the database. Just:
1. Go back to Dashboard
2. Find your project
3. Click on your notebook

### Training fails

Common issues:
- Out of memory: Reduce `device_batch_size`
- Out of disk space: Clean old checkpoints
- CUDA errors: Check GPU availability with `nvidia-smi`

## 🎉 Success!

You're now ready to start training your own GPT models with NanoChat!

Remember:
- Start small (test code in notebook cells)
- Run training in terminal (it takes hours)
- Monitor progress (check logs)
- Save your work (click Save button)
- Have fun learning! 🚀

Happy training! 🎓✨
