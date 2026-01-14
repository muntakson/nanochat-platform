# Quick Start Guide

## ✅ Installation Complete!

Your NanoChat Platform is ready to use. All dependencies have been installed.

## 🚀 Starting the Platform

### Option 1: Start Both Servers Together

```bash
cd /var/www/gpt2/nanochat-platform

# Terminal 1 - Backend
cd backend
venv_new/bin/python main.py

# Terminal 2 - Frontend (in new terminal)
cd frontend
npm run dev
```

### Option 2: Using Screen (Recommended for Server)

```bash
cd /var/www/gpt2/nanochat-platform

# Start backend in screen
screen -S nanochat-backend
cd backend
venv_new/bin/python main.py
# Press Ctrl+A then D to detach

# Start frontend in another screen
screen -S nanochat-frontend
cd frontend
npm run dev
# Press Ctrl+A then D to detach

# To reattach: screen -r nanochat-backend or screen -r nanochat-frontend
# To list screens: screen -ls
```

## 🌐 Access URLs

- **Frontend**: http://localhost:3006
- **Backend API**: http://localhost:8001
- **API Docs**: http://localhost:8001/docs

If running on a server, replace `localhost` with your server's IP address.

## 📝 First Steps

1. Open http://localhost:3006 in your browser
2. Click "Register here" to create an account
3. Create your first project
4. Create a notebook
5. Start coding with nanochat!

## 💻 Example Code for First Cell

```python
import sys
print(f'Python {sys.version}')
print('Welcome to NanoChat Platform!')

# Import nanochat
import torch
print(f'PyTorch {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')

# Check nanochat path
import os
print(f'Working directory: {os.getcwd()}')
```

## 🧪 Training Example

```python
# Quick nanochat test - check if tokenizer exists
from nanochat.tokenizer import Tokenizer
tokenizer = Tokenizer()
print(f'Tokenizer vocab size: {tokenizer.vocab_size}')

# Encode some text
text = "Hello nanochat!"
tokens = tokenizer.encode(text)
print(f'Tokens: {tokens}')
print(f'Decoded: {tokenizer.decode(tokens)}')
```

## 🔧 Troubleshooting

### Backend won't start
- Make sure you're using the venv Python: `venv_new/bin/python main.py`
- Check if port 8001 is already in use: `lsof -i :8001`

### Frontend won't start
- Make sure port 3006 is available: `lsof -i :3006`
- Try `npm install` again if you see dependency errors

### Code execution fails
- Check that nanochat path exists: `/var/www/gpt2/nanochat`
- Verify nanochat venv exists: `/var/www/gpt2/nanochat/.venv/bin/python`

## 📚 Features

- ✅ User authentication and registration
- ✅ Project management
- ✅ Jupyter-style notebooks
- ✅ Live code execution with streaming output
- ✅ Multiple code cells per notebook
- ✅ Auto-save functionality
- ✅ Full nanochat integration

## 🎯 What Students Can Do

1. **Train Models**: Run speedrun.sh or custom training scripts
2. **Chat with Models**: Use trained models for inference
3. **Evaluate Models**: Run metrics and evaluations
4. **Experiment**: Write custom Python code using nanochat library

Enjoy your NanoChat Platform! 🚀
