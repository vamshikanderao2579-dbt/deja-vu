#!/usr/bin/env python3
"""Generate Sparky, the app's mascot, with Muse Image (Meta Model API).

    python3 scripts/generate_mascot.py            # 4 options -> public/sparky-option-1..4.png
    python3 scripts/generate_mascot.py --n 2      # fewer options (each one is a paid call)
    python3 scripts/generate_mascot.py --prompt "..."  # try your own wording

Reads MAIN_API_KEY (and MAIN_BASE_URL) from .env. Every option is resized and
center-cropped to 1024x765, the same size as the placeholder public/sparky.jpeg.
Pick one, save it as public/sparky.png and set AGENT_AVATAR=sparky.png in .env.
No dependencies: standard library + macOS `sips` for the resize.
"""
import argparse, base64, json, os, shutil, subprocess, sys, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTH, HEIGHT = 1024, 765  # match public/sparky.jpeg

# The prompt lives with the engine's other prompts.
with open(os.path.join(ROOT, "src", "engine", "prompts", "mascot.image.md")) as f:
    PROMPT = f.read().rstrip("\n")

# Sizes to try, closest to 1024x765 first; the result is resized/cropped either way.
SIZES = ["1024x768", "1536x1024", "1024x1024"]


def env(key, default=""):
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for line in open(path):
            if line.strip().startswith(key + "="):
                return line.split("=", 1)[1].strip().strip("'\"")
    return os.environ.get(key, default)


def request(base, key, body):
    req = urllib.request.Request(
        base.rstrip("/") + "/images/generations",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.load(res)


def generate(base, key, prompt, n):
    """Ask for n images; adapts if a size or n>1 isn't supported."""
    last = None
    for size in SIZES + [None]:
        body = {"model": "muse-image-1.0", "prompt": prompt, "n": n}
        if size:
            body["size"] = size
        try:
            print(f"Asking Muse Image for {n} option(s){' at ' + size if size else ''}…")
            return request(base, key, body)["data"]
        except urllib.error.HTTPError as e:
            last = e.read().decode(errors="replace")
            try:
                param = json.loads(last).get("error", {}).get("param")
            except ValueError:
                param = None
            if e.code == 400 and param == "size":
                print(f"  size {size} not accepted, trying another")
                continue
            if e.code == 400 and param == "n" and n > 1:
                print("  one image per request only: asking one at a time")
                return [item for _ in range(n) for item in generate(base, key, prompt, 1)]
            sys.exit(f"Muse Image error {e.code}: {last[:400]}")
    sys.exit(f"Muse Image rejected every size: {last[:400]}")


def save(item, path):
    if item.get("b64_json"):
        open(path, "wb").write(base64.b64decode(item["b64_json"]))
    elif item.get("url"):
        urllib.request.urlretrieve(item["url"], path)
    else:
        sys.exit(f"Unexpected response item: {list(item)}")


def fit(path):
    """Resize to cover 1024x765, then center-crop to exactly that size."""
    if not shutil.which("sips"):
        print("  (sips not found: kept the original size)")
        return
    w, h = (int(v) for v in subprocess.check_output(
        ["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], text=True).split()[-3::2])
    scale = max(WIDTH / w, HEIGHT / h)
    subprocess.run(["sips", "-z", str(round(h * scale)), str(round(w * scale)), path], check=True, capture_output=True)
    subprocess.run(["sips", "-c", str(HEIGHT), str(WIDTH), path], check=True, capture_output=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=4, help="how many options (default 4)")
    ap.add_argument("--prompt", default=PROMPT)
    ap.add_argument("--out", default=os.path.join(ROOT, "public"))
    args = ap.parse_args()

    key = env("MAIN_API_KEY")
    if not key:
        sys.exit("No MAIN_API_KEY in .env")
    base = env("MAIN_BASE_URL", "https://api.meta.ai/v1")

    items = generate(base, key, args.prompt, args.n)
    os.makedirs(args.out, exist_ok=True)
    for i, item in enumerate(items, 1):
        path = os.path.join(args.out, f"sparky-option-{i}.png")
        save(item, path)
        fit(path)
        print(f"  saved {os.path.relpath(path, ROOT)} ({WIDTH}x{HEIGHT})")
    print("\nPick one: cp public/sparky-option-N.png public/sparky.png, then set AGENT_AVATAR=sparky.png in .env and restart the app.")


if __name__ == "__main__":
    main()
