#!/usr/bin/env python3
"""Camera helper for bb-plugin-camera.

macOS will not give the BB desktop app (or anything BB starts) camera frames,
so this helper runs outside BB: start it yourself from Terminal. It captures
the camera with ffmpeg and serves the latest JPEG frame on 127.0.0.1 only.
Each run creates a random token and writes {port, token, pid} to
~/.bb-camera/helper.json (mode 600). The plugin server reads that file and
sends the token with every request.

    python3 camera_helper.py                  # first camera, port 8765
    python3 camera_helper.py --list           # list cameras
    python3 camera_helper.py --device "Brio"  # pick by name or index

Endpoints (all require the X-Camera-Token header):
    GET /health            JSON status
    GET /frame?after=N     latest JPEG; waits up to 1 s for a frame newer than N
"""

from __future__ import annotations

import argparse
import hmac
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

STATE_DIR = Path.home() / ".bb-camera"
STATE_FILE = STATE_DIR / "helper.json"
SOI = b"\xff\xd8"
EOI = b"\xff\xd9"
MAX_BUFFER = 8 * 1024 * 1024


def find_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if path is None:
        for candidate in ("/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"):
            if os.access(candidate, os.X_OK):
                return candidate
        sys.exit("ffmpeg not found. Install it with: brew install ffmpeg")
    return path


def list_devices(ffmpeg: str) -> list[tuple[str, str]]:
    """Return (index, name) for every AVFoundation video device."""
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
        capture_output=True,
        text=True,
    )
    devices: list[tuple[str, str]] = []
    in_video = False
    for line in result.stderr.splitlines():
        if "AVFoundation video devices" in line:
            in_video = True
            continue
        if "AVFoundation audio devices" in line:
            break
        match = re.search(r"\[(\d+)\] (.+)$", line)
        if in_video and match:
            devices.append((match.group(1), match.group(2).strip()))
    return devices


def resolve_device(ffmpeg: str, wanted: str | None) -> tuple[str, str]:
    devices = [d for d in list_devices(ffmpeg) if not d[1].startswith("Capture screen")]
    if not devices:
        sys.exit("No cameras found.")
    if wanted is None:
        return devices[0]
    for index, name in devices:
        if wanted == index or wanted.lower() in name.lower():
            return index, name
    sys.exit(f"No camera matches {wanted!r}. Run with --list to see cameras.")


def jpeg_size(data: bytes) -> tuple[int, int]:
    """Read width/height from a JPEG's SOF marker; (0, 0) if not found."""
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        length = int.from_bytes(data[i + 2 : i + 4], "big")
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(data[i + 5 : i + 7], "big")
            width = int.from_bytes(data[i + 7 : i + 9], "big")
            return width, height
        i += 2 + length
    return 0, 0


class FrameStore:
    def __init__(self) -> None:
        self.cond = threading.Condition()
        self.frame: bytes | None = None
        self.size = (0, 0)
        self.seq = 0
        self.at = 0.0
        self.error: str | None = None

    def put(self, frame: bytes) -> None:
        size = jpeg_size(frame)
        with self.cond:
            self.frame = frame
            self.size = size
            self.seq += 1
            self.at = time.time()
            self.error = None
            self.cond.notify_all()

    def fail(self, message: str) -> None:
        with self.cond:
            self.error = message
            self.cond.notify_all()

    def wait_newer(self, after: int, timeout: float):
        with self.cond:
            self.cond.wait_for(lambda: self.seq > after, timeout=timeout)
            return self.frame, self.seq, self.size, self.at


def run_capture(ffmpeg: str, device: str, args, store: FrameStore, stop: threading.Event) -> None:
    """Keep ffmpeg running; split its MJPEG output into frames."""
    while not stop.is_set():
        command = [
            ffmpeg, "-hide_banner", "-loglevel", "error",
            "-f", "avfoundation",
            "-framerate", str(args.camera_fps),
            "-video_size", args.size,
            "-pixel_format", args.pixel_format,
            "-i", f"{device}:none",
            "-vf", f"fps={args.fps}",
            "-f", "mjpeg", "-q:v", str(args.quality),
            "pipe:1",
        ]
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        errors: list[str] = []

        def drain_stderr() -> None:
            assert process.stderr is not None
            for raw in process.stderr:
                line = raw.decode("utf-8", "replace").strip()
                if line:
                    errors.append(line)
                    del errors[:-20]
                    print(f"ffmpeg: {line}", file=sys.stderr)

        threading.Thread(target=drain_stderr, daemon=True).start()
        buffer = b""
        assert process.stdout is not None
        while not stop.is_set():
            chunk = process.stdout.read1(65536)
            if not chunk:
                break
            buffer += chunk
            while True:
                start = buffer.find(SOI)
                if start < 0:
                    buffer = b""
                    break
                end = buffer.find(EOI, start + 2)
                if end < 0:
                    buffer = buffer[start:]
                    break
                store.put(buffer[start : end + 2])
                buffer = buffer[end + 2 :]
            if len(buffer) > MAX_BUFFER:
                buffer = b""
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        if stop.is_set():
            return
        message = errors[-1] if errors else f"ffmpeg exited with code {process.returncode}"
        store.fail(message)
        print(f"Camera stopped ({message}); restarting in 2 s…", file=sys.stderr)
        stop.wait(2)


def make_handler(store: FrameStore, token: str, device_name: str):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:  # quiet
            pass

        def send_json(self, status: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self) -> None:
            supplied = self.headers.get("X-Camera-Token", "")
            if not hmac.compare_digest(supplied, token):
                self.send_json(401, {"error": "bad token"})
                return
            url = urlparse(self.path)
            if url.path == "/health":
                with store.cond:
                    self.send_json(200, {
                        "ok": store.frame is not None and store.error is None,
                        "device": device_name,
                        "seq": store.seq,
                        "width": store.size[0],
                        "height": store.size[1],
                        "frameAgeMs": int((time.time() - store.at) * 1000) if store.at else None,
                        "error": store.error,
                    })
                return
            if url.path == "/frame":
                try:
                    after = int(parse_qs(url.query).get("after", ["0"])[0])
                except ValueError:
                    after = 0
                frame, seq, (width, height), at = store.wait_newer(after, 1.0)
                if frame is None:
                    self.send_json(503, {"error": store.error or "No frame yet."})
                    return
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(frame)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Frame-Seq", str(seq))
                self.send_header("X-Frame-Width", str(width))
                self.send_header("X-Frame-Height", str(height))
                self.send_header("X-Frame-Age-Ms", str(int((time.time() - at) * 1000)))
                self.end_headers()
                self.wfile.write(frame)
                return
            self.send_json(404, {"error": "not found"})

    return Handler


def write_state(port: int, token: str) -> None:
    STATE_DIR.mkdir(mode=0o700, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as file:
        json.dump({"port": port, "token": token, "pid": os.getpid()}, file)
    os.replace(tmp, STATE_FILE)


def clear_state() -> None:
    try:
        current = json.loads(STATE_FILE.read_text())
        if current.get("pid") == os.getpid():
            STATE_FILE.unlink()
    except (OSError, ValueError):
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--device", help="camera index or part of its name (default: first camera)")
    parser.add_argument("--list", action="store_true", help="list cameras and exit")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--size", default="1280x720", help="capture size (default 1280x720)")
    parser.add_argument("--camera-fps", default="30", help="rate requested from the camera (default 30)")
    parser.add_argument("--pixel-format", default="nv12", help="camera pixel format (default nv12; see ffmpeg's error for supported ones)")
    parser.add_argument("--fps", type=int, default=15, help="frames served per second (default 15)")
    parser.add_argument("--quality", type=int, default=5, help="JPEG quality 2 (best) to 31 (default 5)")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg()
    if args.list:
        for index, name in list_devices(ffmpeg):
            print(f"[{index}] {name}")
        return
    device, device_name = resolve_device(ffmpeg, args.device)

    store = FrameStore()
    stop = threading.Event()
    token = secrets.token_urlsafe(24)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(store, token, device_name))
    server.daemon_threads = True
    write_state(args.port, token)

    def shutdown(*_args) -> None:
        stop.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    capture = threading.Thread(target=run_capture, args=(ffmpeg, device, args, store, stop), daemon=True)
    capture.start()
    print(f"Camera helper: {device_name} → http://127.0.0.1:{args.port} (Ctrl-C to stop)")
    print("If macOS asks, allow camera access for your terminal app.")
    try:
        server.serve_forever()
    finally:
        stop.set()
        clear_state()
        capture.join(timeout=5)
        print("Camera helper stopped.")


if __name__ == "__main__":
    main()
