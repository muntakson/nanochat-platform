# Inference Guide - CLI Method

## Overview

Your GB10 server is running on ARM64 architecture in CPU mode. The nanochat platform's web-based inference requires GPU with Flash Attention 3 support, which is not available on ARM64/CPU.

However, you can still chat with your trained models using the **nanochat CLI**!

## ✅ What Works

1. **Model Discovery**: The inference page shows all 18 of your trained models
2. **Model Information**: View model architecture, validation loss, training steps
3. **CLI Inference**: Chat with models via command line (see below)

## 🚀 How to Chat with Your Models (CLI)

### Quick Start

```bash
# Navigate to nanochat directory
cd /var/www/gpt2/nanochat

# Activate the virtual environment
source .venv/bin/activate

# Chat with your best SFT model (d12_step2000)
python -m scripts.chat_cli -i sft
```

### Available Options

#### 1. Chat with SFT Model (Recommended)
```bash
python -m scripts.chat_cli -i sft
```
This uses your latest SFT checkpoint (d12_step2000 - 5.5 days of training!)

#### 2. Chat with Specific Model
```bash
# Chat with specific model tag
python -m scripts.chat_cli -i sft -g d12

# Chat with specific step
python -m scripts.chat_cli -i sft -g d12 -s 2000
```

#### 3. Chat with Mid-trained Model
```bash
python -m scripts.chat_cli -i mid
```

#### 4. One-Shot Query
```bash
python -m scripts.chat_cli -i sft -p "Why is the sky blue?"
```

#### 5. Adjust Temperature
```bash
# More creative (temperature 1.0)
python -m scripts.chat_cli -i sft -t 1.0

# More deterministic (temperature 0.5)
python -m scripts.chat_cli -i sft -t 0.5
```

### Interactive Chat Example

```bash
$ python -m scripts.chat_cli -i sft

NanoChat Interactive Mode
--------------------------------------------------
Type 'quit' or 'exit' to end the conversation
Type 'clear' to start a new conversation
--------------------------------------------------

User: Hello! Tell me about GPT models.