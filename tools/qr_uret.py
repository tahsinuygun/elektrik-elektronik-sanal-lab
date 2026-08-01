from pathlib import Path
import sys, qrcode
BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://KULLANICI_ADI.github.io/elektrik-elektronik-sanal-lab"
out = Path(__file__).resolve().parents[1] / "qr"
out.mkdir(exist_ok=True)
for platform, name in [("ios","iphone-qr.png"),("android","android-qr.png")]:
    url=f"{BASE_URL}/?platform={platform}"
    img=qrcode.make(url)
    img.save(out/name)
    print(name, "->", url)
