import { test, expect } from '@playwright/test';
import { inYear, timing, validDate, type Anniversary } from '../src/features/anniversary/model';

const event = (date: string, yearly = false): Anniversary => ({ name:'测试', date, yearly, color:'pink', theme:'生活', note:'', icon:'', createdAt:0, updatedAt:0 });
test('单次事件、今天、过去、跨年与真实天数', () => {
  expect(timing(event('2026-10-23'), '2026-10-23').days).toBe(0);
  expect(timing(event('2026-10-22'), '2026-10-23').days).toBe(-1);
  expect(timing(event('2027-01-01'), '2026-12-31').days).toBe(1);
  expect(timing(event('2024-03-01'), '2024-02-28').days).toBe(2);
  expect(timing(event('2025-03-01'), '2025-02-28').days).toBe(1);
});
test('年度事件下一次、今天、未来起始年和累计周年', () => {
  expect(timing(event('2020-05-20', true), '2026-10-23')).toMatchObject({ occurrence:'2027-05-20', years:6 });
  expect(timing(event('2020-10-23', true), '2026-10-23')).toMatchObject({ days:0, years:6 });
  expect(timing(event('2030-01-01', true), '2026-10-23')).toMatchObject({ occurrence:'2030-01-01', years:0 });
  expect(inYear(event('2030-01-01', true), 2029)).toBeNull();
  expect(inYear(event('2020-05-20'), 2026)).toBeNull();
});
test('2月29日平年回落2月28日，闰年恢复，世纪闰年规则', () => {
  const leap = event('2000-02-29', true);
  expect(timing(leap, '2025-02-28')).toMatchObject({ days:0, occurrence:'2025-02-28', years:25 });
  expect(timing(leap, '2027-03-01').occurrence).toBe('2028-02-29');
  expect(inYear(leap, 2100)).toBe('2100-02-28');
  expect(inYear(leap, 2400)).toBe('2400-02-29');
});
test('有效日期拒绝自动溢出的日期与非法格式', () => {
  for (const key of ['2025-02-29','2026-13-01','2026-04-31','2026-1-1','','0001-01-01']) expect(validDate(key)).toBe(false);
  expect(validDate('2024-02-29')).toBe(true);
});

for (const zone of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
  test(`本地日期、UTC跨日与夏令时：${zone}`, async ({ browser }) => {
    const context = await browser.newContext({ timezoneId:zone });
    const page = await context.newPage();
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const modulePath = '/src/features/anniversary/model.ts';
      const { dateKey, timing } = await import(modulePath);
      const sample = { date:'2026-03-09', yearly:false };
      return { key:dateKey(new Date('2026-01-01T00:30:00+14:00')), days:timing(sample, '2026-03-07').days };
    });
    expect(result.key).toBe(zone === 'America/Los_Angeles' ? '2025-12-31' : '2026-01-01');
    expect(result.days).toBe(2);
    await context.close();
  });
}
