import sys
import time
import threading
from pathlib import Path

# Ensure backend directory is in sys.path regardless of execution working directory
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import uvicorn
from app.config import settings
from app.main import app

def run_server():
    uvicorn.run(app, host=settings.HOST, port=settings.PORT, log_level="warning")

def main():
    use_window = "--server" not in sys.argv

    # Start FastAPI backend in a daemon background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    time.sleep(1.2) # Allow uvicorn to bind

    url = f"http://{settings.HOST}:{settings.PORT}"
    print(f"[*] Stemwave Backend running at {url}")

    if use_window:
        try:
            import webview
            print("[*] Launching native Edge WebView2 Desktop window...")
            window = webview.create_window(
                title="Stemwave - UVR Player",
                url=url,
                width=1180,
                height=760,
                min_size=(920, 600),
                frameless=False,
                background_color="#0a0a0a"
            )
            webview.start(gui="edgechromium", debug=False)
            return
        except ImportError:
            print("[!] pywebview not installed. Opening in default web browser...")
            import webbrowser
            webbrowser.open(url)
    else:
        print("[*] Running in headless server mode. Press Ctrl+C to terminate.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Shutting down...")

if __name__ == "__main__":
    main()
