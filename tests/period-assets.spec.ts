import { test, expect } from '@playwright/test';

const viewports = [
  { width: 360, height: 740 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];

const assets = [
  ['cats_header.png', '/assets/cozy_days/raster/characters/cats_header.png', 1602, 884, 0.4186, '01c839801c4a78ce4c37433db0ee63e4a171fe3b19645c3b5756d37dde05e59a'],
  ['cats_empty_state.png', '/assets/cozy_days/raster/characters/cats_empty_state.png', 1875, 811, 0.44547, '96e7ea984b170bbdb78af03b74e3b3bb7360569cc706f0fd1d139c38f3bff829'],
  ['book_open_decor.png', '/assets/cozy_days/raster/stationery/book_open_decor.png', 394, 258, 0.46766, '22a71d58b0992a999c4ffa2808e80ee928fec6839cc4fff4139cee19420840b2'],
  ['washi_pink.png', '/assets/cozy_days/raster/decor/washi_pink.png', 302, 179, 0.46424, '67d472011ab6ed8e0df6876308fe9dbceb03e210246ecb7e5b03b01c12d7b3cb'],
  ['flower_pink.png', '/assets/cozy_days/raster/decor/flower_pink.png', 139, 138, 0.44422, '563d9fe84ad9482987dcad02852c3fa80326fb084f1a500cfb7a3c6231e6f5f5'],
  ['star_cream.svg', '/assets/cozy_days/vectors/symbols/star_cream.svg', 128, 128, 0.55896, '5d84edd7fbd1406e5cdc658c607c8a5c24607ef2aee4c52c8bfc31b79a84bd84'],
  ['sparkle_gold.svg', '/assets/cozy_days/vectors/symbols/sparkle_gold.svg', 128, 128, 0.721984, '3119e0e755612e7125ad32de61168ef55b5e6e2035c5f6129931749b044fec57'],
  ['heart_pink_outline.svg', '/assets/cozy_days/vectors/symbols/heart_pink_outline.svg', 128, 128, 0.793823, '6137cc47a35ee8c05200ec41efb747efb6edb173dcedee5fa734655fb2c64927'],
] as const;

for (const viewport of viewports) {
  test(`period line icons and tap targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name:'生理期', exact:true }).click();
    const period = page.getByRole('region', { name:'生理期页面' });
    await expect(period.getByRole('heading', {name:'生理期', exact:true})).toBeVisible();
    await expect(period.locator('img')).toHaveCount(0);
    const choices = period.locator('.period-choices button');
    await expect(choices).toHaveCount(23);
    await expect(period.locator('.period-choice-icon')).toHaveCount(23);
    const controls = period.locator('.period-calendar header button, .period-choices button');
    expect(await controls.evaluateAll(buttons => buttons.every(button => {
      const box = button.getBoundingClientRect();
      return box.width >= 44 && box.height >= 44;
    }))).toBe(true);
    expect(await period.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const fills = await period.locator('clipPath').evaluateAll(paths => paths.map(path => path.id));
    expect(new Set(fills).size).toBe(5);
  });
}

test('period asset source files match their declared dimensions, pixel alpha and canonical hashes', async ({ page }) => {
  await page.goto('/');
  const audit = await page.evaluate(async (entries) => {
    const output = [];
    for (const [name, url, width, height, expectedClear, expectedHash] of entries) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const source = new TextDecoder().decode(bytes);
      const canonical = name.endsWith('.svg') ? new TextEncoder().encode(source.replace(/\r\n/g, '\n')) : bytes;
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', canonical))].map(value => value.toString(16).padStart(2, '0')).join('');
      const image = new Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!; context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0, opaque = 0, partial = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] === 0) clear++;
        else if (pixels[index] === 255) opaque++;
        else partial++;
      }
      output.push({ name, width: image.naturalWidth, height: image.naturalHeight, hash, clearFraction: clear / (image.naturalWidth * image.naturalHeight), opaqueFraction: opaque / (image.naturalWidth * image.naturalHeight), partialFraction: partial / (image.naturalWidth * image.naturalHeight), expectedWidth: width, expectedHeight: height, expectedClear, expectedHash });
    }
    return output;
  }, assets);
  console.log(`M4 source audit: ${JSON.stringify(audit)}`);
  expect(audit).toHaveLength(8);
  for (const item of audit) {
    expect(item.width, item.name).toBe(item.expectedWidth);
    expect(item.height, item.name).toBe(item.expectedHeight);
    expect(item.clearFraction, `${item.name} transparent edge coverage`).toBeCloseTo(item.expectedClear, 3);
    expect(item.clearFraction, `${item.name} has alpha`).toBeGreaterThan(0);
    // Some approved PNGs use soft watercolor edges only; painted pixels may all be partially transparent.
    expect(item.opaqueFraction + item.partialFraction, `${item.name} retains painted pixels`).toBeGreaterThan(0);
    expect(item.hash, `${item.name} canonical SHA-256`).toMatch(/^[0-9a-f]{64}$/);
    expect(item.hash, `${item.name} canonical source hash`).toBe(item.expectedHash);
  }
  await page.goto('/review/period-assets/index.html');
  await expect(page.locator('#ready .card')).toHaveCount(8);
  await expect(page.locator('#pending .card')).toHaveCount(14);
  await expect(page.getByText('11 项待重绘')).toBeVisible();
  await page.screenshot({ path: 'artifacts/integration/m4/assets-light.png', fullPage: true });
  await page.getByRole('button', { name: '深色背景' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-bg', 'dark');
  await page.screenshot({ path: 'artifacts/integration/m4/assets-dark.png', fullPage: true });
});

test('period controls work offline when legacy artwork is unavailable', async ({ page, context }) => {
  await page.route('**/assets/cozy_days/raster/characters/cats_header.png', route => route.abort());
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name:'生理期', exact:true }).click();
  await expect(page.locator('.period-calendar')).toBeVisible();
  await context.setOffline(true);
  const choice = page.getByRole('button', { name:'平静', exact:true });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.period-storage')).toBeEmpty();
});