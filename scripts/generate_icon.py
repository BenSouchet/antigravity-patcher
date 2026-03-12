from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
PNG_PATH = ASSETS / "icon.png"
ICO_PATH = ASSETS / "icon.ico"
ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]


def main() -> None:
    if not PNG_PATH.exists():
      raise FileNotFoundError(f"Missing source PNG: {PNG_PATH}")

    with Image.open(PNG_PATH) as source:
        image = source.convert("RGBA")
        image.save(ICO_PATH, format="ICO", sizes=[(size, size) for size in ICON_SIZES])

    print(f"Generated {ICO_PATH} from {PNG_PATH}")


if __name__ == "__main__":
    main()
