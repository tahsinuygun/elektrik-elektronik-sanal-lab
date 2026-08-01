#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS_ROOT = ROOT / "assets" / "models"
CATALOG_PATH = ROOT / "data" / "catalog.json"

TURKISH_UPPER = str.maketrans({
    "i": "İ", "ı": "I", "ş": "Ş", "ğ": "Ğ", "ü": "Ü", "ö": "Ö", "ç": "Ç"
})
TURKISH_ASCII = str.maketrans({
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i",
    "İ": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u"
})


def title_from_filename(stem: str) -> str:
    clean = re.sub(r"[_\-]+", " ", stem).strip()
    clean = re.sub(r"\s+", " ", clean)
    words: list[str] = []

    for word in clean.split():
        # Kullanıcının yazdığı büyük/küçük harfleri mümkün olduğunca koru.
        if word != word.lower():
            words.append(word)
            continue
        if any(char.isdigit() for char in word) or (word.isupper() and len(word) <= 8):
            words.append(word)
            continue
        first = word[0].translate(TURKISH_UPPER)
        words.append(first + word[1:])

    return " ".join(words) or "Adsız Model"


def slugify(value: str) -> str:
    value = value.translate(TURKISH_ASCII)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "model"


def short_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()[:12]


def main() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    departments = catalog.get("departments", [])
    department_names = {item["id"]: item["name"] for item in departments}

    models: list[dict] = []
    used_ids: set[str] = set()

    for department_dir in sorted(MODELS_ROOT.iterdir()):
        if not department_dir.is_dir():
            continue

        department_id = department_dir.name
        if department_id not in department_names:
            print(f"UYARI: Tanımsız klasör atlandı: {department_id}")
            continue

        for glb_path in sorted(department_dir.rglob("*")):
            if not glb_path.is_file() or glb_path.suffix.lower() != ".glb":
                continue

            title = title_from_filename(glb_path.stem)
            base_id = f"{department_id}-{slugify(glb_path.stem)}"
            model_id = base_id
            number = 2
            while model_id in used_ids:
                model_id = f"{base_id}-{number}"
                number += 1
            used_ids.add(model_id)

            relative = glb_path.relative_to(ROOT).as_posix()

            # iPhone AR için aynı klasörde aynı ada sahip USDZ dosyasını otomatik bul.
            usdz_path = next(
                (
                    candidate
                    for candidate in glb_path.parent.iterdir()
                    if candidate.is_file()
                    and candidate.suffix.lower() == ".usdz"
                    and candidate.stem.casefold() == glb_path.stem.casefold()
                ),
                None
            )

            model_entry = {
                "id": model_id,
                "title": title,
                "department": department_id,
                "glb": f"{relative}?v={short_hash(glb_path)}",
                "description": (
                    f"{title} modelinin üç boyutlu ve artırılmış gerçeklik "
                    "ortamında incelenmesi."
                ),
                "learning": [
                    f"{title} modelini farklı açılardan inceleme",
                    "Modelin yapısal ayrıntılarını tanıma",
                    "Modeli artırılmış gerçeklik ortamına yerleştirme"
                ],
                "tags": [department_names[department_id], "3B Model", "AR"]
            }

            if usdz_path is not None:
                usdz_relative = usdz_path.relative_to(ROOT).as_posix()
                model_entry["usdz"] = f"{usdz_relative}?v={short_hash(usdz_path)}"

            models.append(model_entry)

    models.sort(key=lambda item: (item["department"], item["title"].casefold()))
    catalog["models"] = models
    CATALOG_PATH.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )
    print(f"{len(models)} model otomatik olarak kataloğa eklendi. Aynı adlı USDZ dosyaları iPhone AR için eşleştirildi.")


if __name__ == "__main__":
    main()
