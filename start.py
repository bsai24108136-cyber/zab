#!/usr/bin/env python3
"""
MediTrace — One-command local dev start
Usage:  python start.py
        python start.py --port 8001   (if 8000 is busy)
"""
import subprocess, os, pathlib, sys, socket, argparse

ROOT    = pathlib.Path(__file__).parent
BACKEND = ROOT / "backend"
FRONT   = ROOT / "frontend"

VENV_UV = BACKEND / "venv" / "Scripts" / "uvicorn.exe"
if not VENV_UV.exists():
    VENV_UV = BACKEND / "venv" / "bin" / "uvicorn"
UVICORN = str(VENV_UV) if VENV_UV.exists() else "uvicorn"


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


def load_dotenv(path: pathlib.Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def run(cmd: str, cwd=None, extra_env: dict = {}):
    full_env = os.environ.copy()
    full_env.update(extra_env)
    return subprocess.Popen(cmd, shell=True, cwd=cwd or ROOT, env=full_env)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start MediTrace dev servers")
    parser.add_argument("--port", type=int, default=8001, help="Backend port (default 8001)")
    args = parser.parse_args()

    port = args.port
    if not port_free(port):
        for p in range(port + 1, port + 10):
            if port_free(p):
                print(f"⚠️  Port {port} busy — using {p} instead")
                port = p
                break
        else:
            print(f"❌ No free port found near {args.port}. Kill stale processes first.")
            sys.exit(1)

    dot_env = load_dotenv(BACKEND / ".env")
    backend_env = {
        "GEMINI_API_KEY":  dot_env.get("GEMINI_API_KEY",  os.environ.get("GEMINI_API_KEY",  "")),
        "OPENAI_API_KEY":  dot_env.get("OPENAI_API_KEY",  os.environ.get("OPENAI_API_KEY",  "")),
        "SECRET_KEY":      dot_env.get("SECRET_KEY",       "dev-secret-change-in-prod"),
        "DATABASE_URL":    dot_env.get("DATABASE_URL",     "sqlite+aiosqlite:///./meditrace.db"),
        "ALLOWED_ORIGINS": "http://localhost:3000,http://localhost:3001",
    }

    # Auto-sync frontend .env.local to correct port
    (FRONT / ".env.local").write_text(f"NEXT_PUBLIC_API_URL=http://localhost:{port}\n")

    print(f"\n🚀 Starting MediTrace...")
    print(f"   Backend  → http://localhost:{port}")
    print(f"   API Docs → http://localhost:{port}/docs")
    print(f"   Frontend → http://localhost:3000")

    backend  = run(f'"{UVICORN}" main:app --reload --port {port}', cwd=BACKEND, extra_env=backend_env)
    frontend = run("npm run dev", cwd=FRONT)

    print("\n📋 Demo credentials:")
    print("   Admin:    admin@meditrace.com  / admin123")
    print("   Doctor:   doctor@meditrace.com / dr001")
    print("   Patient:  patient@meditrace.com/ pt001")
    print("\nPress Ctrl+C to stop.\n")

    try:
        backend.wait()
        frontend.wait()
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")
        backend.terminate()
        frontend.terminate()

