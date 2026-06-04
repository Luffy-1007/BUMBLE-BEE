from __future__ import annotations

import os
import platform
import re
import subprocess
import time
from pathlib import Path

import psutil
from flask import Flask, jsonify, request, send_from_directory


ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / "public"
HOME = Path.home()

app = Flask(__name__, static_folder=None)

APP_ALIASES = {
    "browser": "msedge" if os.name == "nt" else "https://www.google.com",
    "chrome": "chrome",
    "edge": "msedge",
    "vscode": "code",
    "vs code": "code",
    "spotify": "spotify",
    "terminal": "wt" if os.name == "nt" else "x-terminal-emulator",
    "notepad": "notepad" if os.name == "nt" else "gedit",
}


def open_target(target: str) -> None:
    if os.name == "nt":
        subprocess.Popen(["cmd", "/c", "start", "", target], shell=False)
        return
    if platform.system() == "Darwin":
        subprocess.Popen(["open", target])
        return
    subprocess.Popen(["xdg-open", target])


def system_info() -> dict:
    memory = psutil.virtual_memory()
    return {
        "platform": platform.system().lower(),
        "hostname": platform.node(),
        "uptime": time.time() - psutil.boot_time(),
        "cpuCount": psutil.cpu_count(logical=True) or 1,
        "cpuModel": platform.processor() or "Unknown CPU",
        "memory": {
            "total": memory.total,
            "free": memory.available,
            "used": memory.used,
            "percent": round(memory.percent),
        },
    }


def parse_command(text: str) -> dict:
    user_input = text.strip()
    lower = user_input.lower()

    if not user_input:
        return {"action": "say", "message": "Tell me what you want me to do."}

    open_match = re.match(r"^(open|launch|start)\s+(.+)$", lower)
    if open_match:
        return {"action": "open", "target": open_match.group(2).strip()}

    search_match = re.match(r"^(search|find)\s+(.+?)(?:\s+in\s+(.+))?$", lower)
    if search_match:
        return {
            "action": "search",
            "query": search_match.group(2).strip(),
            "location": (search_match.group(3) or str(HOME)).strip(),
        }

    folder_match = re.match(r"^(create|make)\s+(?:a\s+)?(?:new\s+)?folder\s+(.+)$", lower)
    if folder_match:
        return {"action": "create-folder", "name": folder_match.group(2).strip()}

    if any(word in lower for word in ["cpu", "memory", "system"]):
        return {"action": "system"}

    if "shutdown" in lower or "restart" in lower:
        return {
            "action": "dangerous",
            "message": "This system action needs an explicit YES confirmation before Bumblebee can run it.",
        }

    return {
        "action": "say",
        "message": f'I understood: "{user_input}". Try commands like "Open Chrome", "Find PDFs", "Create folder AI Project", or "Show system status".',
    }


def walk_for_matches(root: Path, query: str, limit: int = 30) -> list[dict]:
    matches: list[dict] = []
    needle = query.lower()

    def walk(directory: Path, depth: int) -> None:
        if len(matches) >= limit or depth > 4:
            return
        try:
            entries = list(directory.iterdir())
        except OSError:
            return

        for entry in entries:
            if len(matches) >= limit:
                return
            if entry.name.startswith(".") or entry.name == "node_modules":
                continue
            if needle in entry.name.lower():
                matches.append(
                    {
                        "name": entry.name,
                        "path": str(entry),
                        "type": "folder" if entry.is_dir() else "file",
                    }
                )
            if entry.is_dir():
                walk(entry, depth + 1)

    walk(root, 0)
    return matches


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "platform": platform.system().lower(), "home": str(HOME)})


@app.get("/api/system")
def system():
    return jsonify(system_info())


@app.post("/api/command")
def command():
    body = request.get_json(silent=True) or {}
    intent = parse_command(str(body.get("text", "")))

    try:
        if intent["action"] == "open":
            target = APP_ALIASES.get(intent["target"], intent["target"])
            if "." in target and not target.startswith("http"):
                target = f"https://{target}"
            open_target(target)
            return jsonify(
                {
                    "intent": intent,
                    "reply": f'Opening {intent["target"]}.',
                    "steps": [f"Resolved target: {target}", "Launch request sent to the OS"],
                }
            )

        if intent["action"] == "search":
            base = HOME / "Downloads" if intent["location"] == "downloads" else Path(intent["location"])
            results = walk_for_matches(base, intent["query"])
            suffix = "" if len(results) == 1 else "s"
            return jsonify(
                {
                    "intent": intent,
                    "reply": f"Found {len(results)} matching item{suffix}.",
                    "results": results,
                }
            )

        if intent["action"] == "create-folder":
            clean_name = re.sub(r'[<>:"/\\|?*]', "", intent["name"]).strip() or "Bumblebee Folder"
            destination = HOME / "Desktop" / clean_name
            destination.mkdir(parents=True, exist_ok=True)
            return jsonify(
                {
                    "intent": intent,
                    "reply": f"Created folder on Desktop: {destination.name}.",
                    "path": str(destination),
                }
            )

        if intent["action"] == "system":
            info = system_info()
            return jsonify(
                {
                    "intent": intent,
                    "reply": f'System is online. Memory usage is {info["memory"]["percent"]} percent across {info["cpuCount"]} CPU threads.',
                    "system": {
                        "platform": info["platform"],
                        "uptime": info["uptime"],
                        "memoryPercent": info["memory"]["percent"],
                    },
                }
            )

        return jsonify({"intent": intent, "reply": intent["message"]})
    except Exception as error:
        return jsonify({"intent": intent, "reply": "I could not complete that action.", "error": str(error)}), 500


@app.post("/api/confirm")
def confirm():
    body = request.get_json(silent=True) or {}
    phrase = str(body.get("phrase", "")).strip()
    command_name = str(body.get("command", "")).strip().lower()

    if phrase != "YES":
        return jsonify({"reply": "Confirmation rejected. Type YES exactly to continue."}), 400

    if command_name == "shutdown":
        if os.name == "nt":
            subprocess.Popen(["shutdown", "/s", "/t", "60"])
        else:
            subprocess.Popen(["shutdown", "-h", "+1"])
        return jsonify({"reply": "Shutdown scheduled for 1 minute from now."})

    return jsonify({"reply": "Unsupported confirmed command."}), 400


@app.get("/")
def index():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/<path:asset_path>")
def assets(asset_path: str):
    return send_from_directory(PUBLIC_DIR, asset_path)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8787, debug=False)
