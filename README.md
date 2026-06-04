# Bumblebee Agent

A local-first Jarvis-style assistant MVP for desktop control experiments.

## Run Locally

```powershell
npm.cmd start
```

Then open:

```txt
http://127.0.0.1:8787
```

This project does not require `npm install`; the current running server uses only built-in Node.js modules.

## Flask Backend Option

Flask is the better long-term backend for desktop AI integration because Python has mature packages for voice, OCR, automation, and local AI tooling.

Python is not installed on this machine right now. Once Python 3.11+ is installed, run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python backend\app.py
```

Then open:

```txt
http://127.0.0.1:8787
```

## Current MVP

- Yellow Bumblebee dashboard UI
- Browser speech input where supported
- Browser text-to-speech replies
- Local command endpoint
- Open apps or websites
- Search files under the user home folder
- Create folders on the Desktop
- Show CPU, memory, uptime, and platform info
- Confirmation gate for dangerous system commands

## Example Commands

```txt
Open Chrome
Open VS Code
Find pdf
Create folder AI Project
Show system status
Open github.com
```
