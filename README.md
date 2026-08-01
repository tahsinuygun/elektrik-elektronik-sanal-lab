# Elektrik-Elektronik Mühendisliği Sanal Laboratuvarı — Otomatik Sürüm

Bu sürümde `catalog.json` dosyasını elle düzenlemeniz gerekmez.

## Model yükleme

1. Scaniverse'ten modeli **GLB** olarak dışa aktarın.
2. Dosyayı ait olduğu anabilim dalı klasörüne yükleyin.
3. GitHub'da **Commit changes** düğmesine basın.
4. GitHub Actions modeli otomatik olarak kataloğa ekler ve siteyi yeniden yayınlar.

Örnek:

```text
assets/models/elektrik-makinalari/Üç Fazlı Asenkron Motor.glb
```

Dosya adı uygulamada model başlığı olarak görünür.

## Anabilim dalı klasörleri

```text
assets/models/
├── elektrik-tesisleri/
├── elektrik-makinalari/
├── elektronik/
├── elektromanyetik/
├── kontrol-kumanda/
├── devreler-sistemler/
└── telekomunikasyon/
```

Model hangi klasöre yüklenirse o anabilim dalının altında gösterilir.

## İlk GitHub Pages ayarı

1. Proje klasörünün içindeki bütün dosyaları GitHub deposunun köküne yükleyin.
2. `Settings > Pages` bölümüne girin.
3. `Build and deployment > Source` alanında **GitHub Actions** seçin.
4. `Actions` sekmesinde `Sanal Laboratuvarı Yayınla` işleminin tamamlanmasını bekleyin.

Bundan sonra yalnızca GLB dosyasını ilgili klasöre yüklemeniz yeterlidir.

## Otomatik sistem

- `.github/workflows/deploy-pages.yml`: Her yüklemede sistemi çalıştırır.
- `tools/generate_catalog.py`: Klasörleri tarar ve katalog verisini otomatik oluşturur.
- `data/catalog.json`: Elle düzenlenmez; yayınlama sırasında otomatik hazırlanır.
