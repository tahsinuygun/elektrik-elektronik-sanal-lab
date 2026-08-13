import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = process.cwd();
const catalogPath = path.join(root, 'data', 'catalog.json');
const previewDir = path.join(root, 'assets', 'previews');
fs.mkdirSync(previewDir, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const models = Array.isArray(catalog.models) ? catalog.models : [];

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-dev-shm-usage', '--use-gl=swiftshader']
});

let ok = 0;
let failed = 0;

for (const model of models) {
  const page = await browser.newPage({
    viewport: { width: 640, height: 420 },
    deviceScaleFactor: 1
  });

  try {
    const modelUrl = new URL(model.glb, 'http://127.0.0.1:4173/').href;
    const rendererUrl =
      'http://127.0.0.1:4173/tools/preview-renderer.html?src=' +
      encodeURIComponent(modelUrl);

    await page.goto(rendererUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForFunction(
      () => window.__previewReady === true || window.__previewError,
      null,
      { timeout: 90000 }
    );

    const error = await page.evaluate(() => window.__previewError);
    if (error) throw new Error(error);

    const mv = page.locator('#mv');
    const png = await mv.screenshot({ type: 'png' });

    const output = path.join(previewDir, `${model.id}.webp`);
    await sharp(png)
      .resize(640, 420, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 5 })
      .toFile(output);

    console.log(`OK  ${model.id} -> ${path.relative(root, output)}`);
    ok++;
  } catch (err) {
    failed++;
    console.error(`HATA ${model.id}:`, err?.message || err);
  } finally {
    await page.close();
  }
}

await browser.close();

console.log(`Poster üretimi tamamlandı. Başarılı: ${ok}, Hatalı: ${failed}`);

if (ok === 0 && models.length > 0) {
  process.exit(1);
}
