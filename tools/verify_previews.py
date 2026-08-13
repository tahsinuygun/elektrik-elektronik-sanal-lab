#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "data" / "catalog.json").read_text(encoding="utf-8"))

missing = []
too_small = []

for model in catalog.get("models", []):
    poster_url = model.get("poster", "").split("?")[0]
    if not poster_url:
        missing.append((model.get("id"), "poster alanı yok"))
        continue

    path = ROOT / poster_url

    if not path.exists():
        missing.append((model.get("id"), poster_url))
        continue

    # Gerçek render olduğundan emin olmak için aşırı küçük dosyaları da hata kabul et.
    if path.stat().st_size < 8000:
        too_small.append((model.get("id"), poster_url, path.stat().st_size))

if missing or too_small:
    print("POSTER DOĞRULAMA HATASI")
    if missing:
        print("Eksik posterler:")
        for item in missing:
            print(" -", item)
    if too_small:
        print("Şüpheli derecede küçük posterler:")
        for item in too_small:
            print(" -", item)
    raise SystemExit(1)

print(f"Poster doğrulama başarılı: {len(catalog.get('models', []))} modelin tamamında gerçek poster mevcut.")
