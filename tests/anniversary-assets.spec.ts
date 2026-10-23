import { test, expect } from '@playwright/test';

const viewports = [
  { width:360, height:740 },
  { width:393, height:852 },
  { width:430, height:932 },
];

for (const viewport of viewports) {
  test(`anniversary assets and full card framing at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name:'纪念日', exact:true }).click();
    const hero = page.locator('.ann-hero');
    await expect(hero.locator('.ann-cats')).toBeVisible();
    await expect(hero.locator('.ann-title-heart')).toBeVisible();
    await expect(hero.locator('.ann-sparkle')).toBeVisible();
    await expect(hero.locator('.ann-hero-flower')).toBeVisible();
    await expect(hero.locator('.ann-hero-star')).toBeVisible();
    const images = await page.locator('.ann-hero img').evaluateAll(imgs => imgs.map(img => ({
      name: img.getAttribute('src'), loaded: (img as HTMLImageElement).naturalWidth > 0,
      width: (img as HTMLImageElement).naturalWidth,
    })));
    expect(images).toHaveLength(5);
    expect(images.every(image => image.loaded)).toBe(true);
    expect(images.map(image => image.name?.split('/').at(-1))).toEqual(expect.arrayContaining([
      'cats_empty_state.png', 'heart_pink_outline.svg', 'sparkle_gold.svg', 'flower_pink.png', 'star_cream.svg',
    ]));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path:`artifacts/integration/m3/hero-empty-${viewport.width}.png` });

    await page.getByRole('button', { name:'新增纪念日', exact:true }).click();
    const form = page.getByRole('dialog', { name:'新增纪念日', exact:true });
    await form.getByLabel('纪念日名称').fill(`相遇纪念 ${viewport.width}`);
    await form.getByLabel('日期', { exact:true }).fill('2023-05-20');
    await form.getByRole('button', { name:'保存纪念日', exact:true }).click();
    await expect(page.getByTestId('anniversary-card')).toHaveCount(1);
    const card = page.getByTestId('anniversary-card').first();
    await expect(card.locator('.ann-card-star')).toBeVisible();
    await expect(card.locator('.ann-card-heart')).toBeVisible();
    await expect(card.locator('.ann-card-flower')).toBeVisible();
    await expect(card.locator('.ann-card-tape')).toBeVisible();
    expect(await page.locator('.ann-page').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const audit = await page.evaluate(async () => {
      const files = [
        ['cats_empty_state.png', '/assets/cozy_days/raster/characters/cats_empty_state.png'],
        ['flower_pink.png', '/assets/cozy_days/raster/decor/flower_pink.png'],
        ['heart_pink_outline.svg', '/assets/cozy_days/vectors/symbols/heart_pink_outline.svg'],
        ['star_cream.svg', '/assets/cozy_days/vectors/symbols/star_cream.svg'],
        ['sparkle_gold.svg', '/assets/cozy_days/vectors/symbols/sparkle_gold.svg'],
        ['washi_pink.png', '/assets/cozy_days/raster/decor/washi_pink.png'],
      ];
      const rows = [];
      for (const [name, url] of files) {
        const bytes = await (await fetch(url)).arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let clear = 0, solid = 0;
        for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) clear++; if (pixels[i] === 255) solid++; }
        rows.push({ name, hash, width: image.naturalWidth, height: image.naturalHeight, clearFraction: clear / (image.naturalWidth * image.naturalHeight), solidFraction: solid / (image.naturalWidth * image.naturalHeight) });
      }
      return rows;
    });
    console.log(`M3 asset audit ${viewport.width}: ${JSON.stringify(audit)}`);
    expect(audit.every(item => /^[0-9a-f]{64}$/.test(item.hash))).toBe(true);
    expect(audit.filter(item => item.name.endsWith('.png')).every(item => item.clearFraction > 0 && item.solidFraction > 0)).toBe(true);
    await card.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    const tapeBox = await card.locator('.ann-card-tape').boundingBox();
    const countBox = await card.locator('.ann-count').boundingBox();
    const flowerBox = await card.locator('.ann-card-flower').boundingBox();
    const controls = await card.locator('.ann-card-bottom button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { x:r.x, y:r.y, right:r.right, bottom:r.bottom }; }));
    const overlaps = (a: {x:number;y:number;width:number;height:number}, b: {x:number;y:number;right:number;bottom:number}) => a.x < b.right && a.x+a.width > b.x && a.y < b.bottom && a.y+a.height > b.y;
    expect(overlaps(tapeBox!, countBox!)).toBe(false);
    expect(controls.every(control => !overlaps(flowerBox!, control))).toBe(true);
    const viewportSize = page.viewportSize()!;
    expect(cardBox!.y).toBeGreaterThanOrEqual(0);
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(viewportSize.height);
    await page.screenshot({ path:`artifacts/integration/m3/card-${viewport.width}.png` });
  });
}

test('anniversary asset gallery checks reference fit and transparent edges on light and dark backgrounds', async ({ page }) => {
  await page.setViewportSize({ width:1100, height:860 });
  await page.goto('/review/anniversary-assets/index.html');
  await expect(page.getByRole('heading', { name:'纪念日素材验收图册' })).toBeVisible();
  await expect(page.locator('#gallery article')).toHaveCount(15);
  await expect(page.locator('#gallery .ready')).toHaveCount(6);
  await expect(page.locator('#gallery .meta > .redraw')).toHaveCount(9);
  await expect(page.locator('#gallery img')).toHaveCount(6);
  await expect(page.locator('#gallery img').evaluateAll(images => images.every(img => (img as HTMLImageElement).naturalWidth > 0))).resolves.toBe(true);
  await page.screenshot({ path:'artifacts/integration/m3/assets-light.png', fullPage:true });
  await page.getByRole('button', { name:'深色底' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-bg', 'dark');
  await page.screenshot({ path:'artifacts/integration/m3/assets-dark.png', fullPage:true });
});
