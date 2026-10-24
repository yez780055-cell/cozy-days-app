import { test, expect } from '@playwright/test';
import { addDays, cycleStats, dateStatus, dayNumber, daysBetween, emptyData, monthGrid, shiftMonth, validatePeriod } from '../src/features/period/model';

test('date-only arithmetic handles leap years, month boundaries and DST days',()=>{
  expect(addDays('2024-02-28',1)).toBe('2024-02-29');
  expect(addDays('2025-02-28',1)).toBe('2025-03-01');
  expect(addDays('2026-12-31',1)).toBe('2027-01-01');
  expect(shiftMonth('2026-01',-1)).toBe('2025-12');
  expect(daysBetween('2026-03-07','2026-03-09')).toBe(2);
  expect(Number.isNaN(dayNumber('2026-02-29'))).toBeTruthy();
  for(const month of ['2024-02','2026-02','2026-08','2026-11']) {
    const grid=monthGrid(month); expect(grid.length%7).toBe(0);
    expect(new Date(dayNumber(grid[0])*86400000).getUTCDay()).toBe(0);
    expect(new Set(grid).size).toBe(grid.length);
  }
  expect(monthGrid('2026-08')).toHaveLength(42);
  expect(monthGrid('2024-02')).toContain('2024-02-29');
});
test('statistics use complete history, distinguish settings, and do not invent missed cycles',()=>{
  const data=emptyData(); expect(cycleStats(data,'2026-10-23').cycleDay).toBeUndefined();
  data.periods=[{id:'a',start:'2026-08-25',end:'2026-08-28'},{id:'b',start:'2026-09-22',end:'2026-09-26'},{id:'c',start:'2026-10-21'}];
  const stats=cycleStats(data,'2026-10-23');
  expect(stats).toMatchObject({cycleDay:3,cycleLength:29,periodLength:5,next:'2026-11-19',remaining:27,cycleSamples:2,periodSamples:2});
  expect(dateStatus('2026-10-23',data,'2026-10-23')).toBe('actual');
  expect(dateStatus('2026-11-19',data,'2026-10-23')).toBe('predicted');
  expect(dateStatus('2026-11-05',data,'2026-10-23')).toBe('ovulation');
  expect(dateStatus('2026-11-01',data,'2026-10-23')).toBe('fertile');
  expect(cycleStats(data,'2027-01-01').remaining).toBeLessThan(0);
  expect(dateStatus('2027-01-05',data,'2027-01-01')).toBe(''); // open entry extends only through today
  data.periods[2].end='2026-10-25';
  expect(dateStatus('2027-01-05',data,'2027-01-01')).toBe('');
});
test('validation rejects overlap, invalid and future records; allows adjacent and self edits',()=>{
  const rows=[{id:'a',start:'2026-10-01',end:'2026-10-05'}];
  expect(validatePeriod({id:'b',start:'2026-10-05'},rows,'2026-10-23')).toContain('重叠');
  expect(validatePeriod({id:'b',start:'2026-10-24'},rows,'2026-10-23')).toContain('未来');
  expect(validatePeriod({id:'b',start:'2026-02-30'},rows,'2026-10-23')).toContain('有效');
  expect(validatePeriod({id:'b',start:'2026-10-06',end:'2026-10-04'},rows,'2026-10-23')).toContain('早于');
  expect(validatePeriod({id:'b',start:'2026-10-06'},rows,'2026-10-23')).toBeUndefined();
  expect(validatePeriod(rows[0],rows,'2026-10-23')).toBeUndefined();
});
test('statistics limit observations to latest six intervals and completed durations',()=>{
  const data=emptyData(); data.periods=Array.from({length:8},(_,i)=>({id:String(i),start:addDays('2026-01-01',i===0?0:10+i*28),end:addDays('2026-01-01',(i===0?0:10+i*28)+3)}));
  expect(cycleStats(data,'2026-10-23')).toMatchObject({cycleLength:28,periodLength:4,cycleSamples:6,periodSamples:6});
});
