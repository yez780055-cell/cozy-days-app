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
  test(`period artwork is legible and contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-23T04:00:00Z') });
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
    const period = page.locator('.period-page');
    await expect(period.locator('.period-art--header .period-art-main')).toBeVisible();
    await expect(period.locator('.period-calendar-flower')).toBeVisible();
    await expect(period.locator('.period-diary-tape')).toBeVisible();
    await expect(period.locator('.period-art--tips .period-art-main')).toBeVisible();
    await expect(period.locator('.period-art--note .period-art-main')).toBeVisible();
    const images = await period.locator('img').evaluateAll(nodes => nodes.map(node => {
      const image = node as HTMLImageElement;
      const style = getComputedStyle(image);
      return { name: image.src.split('/').at(-1), loaded: image.complete && image.naturalWidth > 0, pointerEvents: style.pointerEvents };
    }));
    expect(images.length).toBe(9);
    expect(images.every(image => image.loaded && image.pointerEvents === 'none')).toBe(true);
    expect(new Set(images.map(image => image.name))).toEqual(new Set([
      'cats_header.png', 'cats_empty_state.png', 'book_open_decor.png', 'washi_pink.png', 'flower_pink.png',
      'star_cream.svg', 'sparkle_gold.svg', 'heart_pink_outline.svg',
    ]));
    expect(await period.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const heading = await period.locator('.period-header-copy').boundingBox();
    const heroArt = await period.locator('.period-art--header').boundingBox();
    expect(heading && heroArt && heading.x + heading.width <= heroArt.x).toBe(true);

    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `artifacts/integration/m4/period-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    const overlaps = (a: { x:number; y:number; width:number; height:number }, b: { x:number; y:number; width:number; height:number }) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const flower = await period.locator('.period-calendar-flower').boundingBox();
    const calendarControls = await period.locator('.period-calendar header button').evaluateAll(buttons => buttons.map(button => { const rect = button.getBoundingClientRect(); return { x:rect.x, y:rect.y, width:rect.width, height:rect.height }; }));
    expect(calendarControls.every(control => !overlaps(flower!, control))).toBe(true);
    const diary = period.locator('.period-daily');
    await diary.scrollIntoViewIfNeeded();
    await expect(diary).toBeInViewport();
    const tape = await diary.locator('.period-diary-tape').boundingBox();
    const diaryHeading = await diary.locator('header h2').boundingBox();
    const diaryDate = await diary.locator('header>span').boundingBox();
    expect(overlaps(tape!, diaryHeading!)).toBe(false);
    expect(overlaps(tape!, diaryDate!)).toBe(false);
    await page.screenshot({ path: `artifacts/integration/m4/diary-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
    const tips = period.locator('.period-tips');
    await tips.scrollIntoViewIfNeeded();
    await expect(tips).toBeInViewport();
    const book = await tips.locator('.period-art-main').boundingBox();
    const tipContent = await tips.locator('button[aria-label="查看小贴士详情"]').boundingBox();
    expect(overlaps(book!, tipContent!)).toBe(false);
    await page.screenshot({ path: `artifacts/integration/m4/tips-${viewport.width}x${viewport.height}.png`, animations: 'disabled' });
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

test('a failed illustration request falls back and the period view stays usable offline', async ({ page, context }) => {
  await page.route('**/assets/cozy_days/raster/characters/cats_header.png', route => route.abort());
  await page.clock.install({ time: new Date('2026-10-23T04:00:00Z') });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('button', { name: '生理期', exact: true }).click();
  const header = page.locator('.period-art--header .period-art-main');
  await expect.poll(() => header.getAttribute('src')).toMatch(/^data:image\/svg\+xml,/);
  await expect(header).toHaveJSProperty('naturalWidth', 128);
  await context.setOffline(true);
  await expect(page.locator('.period-calendar')).toBeVisible();
  await expect(page.getByRole('button', { name: '查看小贴士详情' })).toBeVisible();
  await page.getByRole('button', { name: '查看小贴士详情' }).click();
  await expect(page.getByRole('dialog', { name: '给自己的温柔小贴士' })).toBeVisible();
  await expect(page.locator('.period-art--header .period-art-main')).toHaveJSProperty('naturalWidth', 128);
});
