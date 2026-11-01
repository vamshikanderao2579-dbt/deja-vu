# The public link: Déjà Vu on Modal, one small always-on container running the Node server.
#
#   modal setup                           # once: log in to Modal
#   put your key in deploy/deploy.env     # git-ignored, never uploaded as a file
#   modal deploy deploy/modal_app.py      # prints the https://… URL
#
# PUBLIC_DEMO=true: every visitor gets their own copy of a demo persona, or their own
# imported memory, kept on the volume and deleted after a day without a visit.
# Nothing private is uploaded: data/private/, .env and spend files are left out below.
import os
import subprocess

import modal

app = modal.App("deja-vu")

image = modal.Image.from_registry("node:22-slim", add_python="3.12").add_local_dir(
    ".",
    "/app",
    ignore=[
        ".git", ".git/**", ".env", "node_modules/**", "data/private/**", "data/me.json", "data/spend.json",
        "data/profiles/**", "data/*.seed.json", "data/test-state*", "data/active-profile.txt",
        "EYI Package*/**", "eval/results/**", "**/charmander*", ".claude/**", "**/.DS_Store",
        "deploy/deploy.env", "deploy/.modal.toml", ".venv-deploy", ".venv-deploy/**", "data/private", "node_modules",
        "eval/results", "**/__pycache__/**",
    ],
)


# The key travels as a Modal secret, read from deploy/deploy.env on your machine at deploy time.
def deploy_settings():
    path = os.path.join(os.path.dirname(__file__), "deploy.env")
    if not os.path.exists(path):
        return {}  # inside the container: the secret is already attached
    pairs = (line.split("=", 1) for line in open(path) if "=" in line and not line.lstrip().startswith("#"))
    settings = {k.strip(): v.strip() for k, v in pairs}
    if "PASTE_" in settings.get("MAIN_API_KEY", "PASTE_"):
        raise SystemExit("Add your Meta API key to deploy/deploy.env first.")
    return settings


# Sessions, build checkpoints and the daily spend total survive a restart.
data = modal.Volume.from_name("deja-vu-data", create_if_missing=True)


@app.function(
    image=image,
    secrets=[modal.Secret.from_dict(deploy_settings())],
    volumes={"/data": data},
    cpu=0.25,
    memory=512,
    min_containers=1,  # always warm: no cold start while the panel is trying it
    max_containers=1,  # one server, so every visitor's session is in the same place
)
@modal.concurrent(max_inputs=100)
@modal.web_server(3000, startup_timeout=60)
def web():
    env = {
        **os.environ,
        "PORT": "3000",
        "PUBLIC_DEMO": "true",
        "SESSION_DIR": "/data/sessions",
        "BUILD_DIR": "/data/build",
        "SPEND_FILE": "/data/spend.json",
        "DEMO_TODAY": os.environ.get("DEMO_TODAY", "2026-10-27"),  # the demo personas' "today"
        "SPEND_CAP_USD": os.environ.get("SPEND_CAP_USD", "15"),
        "SPEND_TOTAL_CAP_USD": os.environ.get("SPEND_TOTAL_CAP_USD", "60"),
    }
    subprocess.Popen(["node", "server.js"], cwd="/app", env=env)
