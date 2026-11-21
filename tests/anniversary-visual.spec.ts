import { test, expect } from '@playwright/test';
import type { Anniversary } from '../src/features/anniversary/model';

test.use({timezoneId:'Asia/Shanghai'});
const longName = '在一起的每一个普通日子'.repeat(5).slice(0,60);
const longNote = '这一段备注用于检查长文换行与滚动。'.repeat(40).slice(0,500);
const base: Anniversary = {
  name:'今天的约定',date:'2026-11-19',theme:'生活',note:'',icon:'♡',yearly:false,color:'pink',createdAt:1,updatedAt:1,
};
const sample: Anniversary[] = [
  base,
  {...base,name:longName,note:longNote,date:'1970-01-01',theme:'恋爱',yearly:true,createdAt:2},
  {...base,name:'下个月生日',date:'2001-12-06',theme:'生日',yearly:true,createdAt:3},
  {...base,name:'更晚才开始',date:'2026-12-20',timingMode:'cumulative',createdAt:4},
  {...base,name:'很早以前',date:'1970-11-19',createdAt:5},
];

for (const viewport of [{width:360,height:740},{width:393,height:852},{width:430,height:932}]) {
  test(`date tickets, long titles and detail numbers fit at ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+08:00'));
    await page.goto('/');
    await page.evaluate(async rows => {
      const path = '/src/data/database.ts';
      const { anniversaryRepository } = await import(path);
      for (const row of rows) await anniversaryRepository.save(row);
    },sample);
    await page.getByRole('navigation').getByRole('button',{name:'纪念日',exact:true}).click();
    const cards = page.getByTestId('anniversary-card');
    await expect(cards).toHaveCount(5);
    await expect(page.locator('.ann-featured-count')).toHaveText('今天');
    await expect(cards.locator('.ann-ticket--birthday')).toHaveText('DEC06');
    await expect(cards.locator('.ann-ticket--yearly')).toHaveText('JAN01');
    await expect(cards.filter({hasText:'更晚才开始'}).locator('.ann-count')).toHaveText('31天后');
    const search = page.getByRole('searchbox',{name:'搜索纪念日'});
    await search.fill('没有匹配');
    await expect(page.getByText('没有符合条件的纪念日')).toBeVisible();
    await search.fill('长文换行');
    await page.getByRole('button',{name:'网格视图'}).click();
    await expect(cards).toHaveCount(1);
    await cards.getByRole('button').click();
    const detail = page.getByRole('region',{name:'纪念日详情'});
    const art = detail.locator('.ann-art');
    const box = (await art.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(4 / 3, 2);
    expect((await detail.getByRole('heading',{name:longName}).boundingBox())!.y).toBeGreaterThan(box.y+box.height);
    await expect(detail.locator('.ann-numbers dd').first()).toHaveAttribute('aria-label', /^累计 \d{5} 天$/);
    await expect(detail.locator('.ann-numbers dd').nth(1)).toContainText('周年');
    await expect(detail.locator('.ann-detail-note')).toHaveText(longNote);
    expect(await detail.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.getByRole('button',{name:'返回纪念日列表'}).click();
    await expect(search).toHaveValue('长文换行');
    await expect(page.getByRole('button',{name:'网格视图'})).toHaveAttribute('aria-pressed','true');
    await expect(cards).toHaveCount(1);
    expect(await page.locator('.ann-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  });
}
