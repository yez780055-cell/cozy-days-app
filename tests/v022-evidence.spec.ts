import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { emptyData, type PeriodData } from '../src/features/period/model';
test.use({timezoneId:'Asia/Shanghai'});
const out='artifacts/v022-final';
const fixture:PeriodData={periods:[{id:'sep',start:'2026-09-20',end:'2026-09-25'},{id:'oct',start:'2026-10-20'}],days:{'2026-10-25':{date:'2026-10-25',flow:'适中',symptoms:['疲惫'],mood:'平静'}},settings:{cycleLength:30,periodLength:6}};
async function settle(page:Page) {
  await expect.poll(()=>page.evaluate(()=>[...document.fonts].some(f=>f.family==='Yozai'&&f.status==='loaded'))).toBe(true);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
}
async function seed(page:Page,data=fixture) {
  await page.clock.install({time:new Date('2026-10-25T04:00:00Z')});
  await page.addInitScript(()=>{localStorage.setItem('cozy-days.settings-hint-seen','1');localStorage.setItem('cozy-days.font-family','yozai');});
  await page.goto('/');await page.evaluate(async value=>new Promise<void>((resolve,reject)=>{
    const r=indexedDB.open('cozy-days-period',1);r.onupgradeneeded=()=>r.result.createObjectStore('state',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('state','readwrite');tx.objectStore('state').put({id:'local',value});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),data);await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await settle(page);mkdirSync(out,{recursive:true});
}
async function shot(page:Page,name:string) {await settle(page);await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'});}
async function noPageOverflow(page:Page) {expect(await page.locator('.period-page').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);}
const all=['是','否','较多','适中','较少','点滴','无','腹痛','疲惫','头痛','胸部胀痛','其他','开心','平静','焦虑','低落','易怒'];
for(const [width,height] of [[360,740],[393,852],[430,932]]) test(`matched baseline evidence ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await seed(page);
  for(const name of all)await expect(page.getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
  await noPageOverflow(page);await expect(page.getByRole('button',{name:'适中',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.period-date.today.chosen.actual')).toHaveAttribute('aria-label',/^2026-10-25/);
  await shot(page,`period-${width}x${height}-after`);
  const geometry=await page.locator('.period-page').evaluate(el=>({clientHeight:el.clientHeight,scrollHeight:el.scrollHeight}));
  writeFileSync(`${out}/geometry-${width}x${height}.json`,JSON.stringify({viewport:{width,height},fixture,clock:'2026-10-25T04:00:00Z',timezone:'Asia/Shanghai',geometry},null,2));
});
test('empty summary plus top24 bottom24 safe area stays on one screen',async({page})=>{
  await page.setViewportSize({width:360,height:740});await seed(page,emptyData());
  await page.addStyleTag({content:'.phone{padding-top:24px!important}.bottom-nav{height:96px!important;padding-bottom:29px!important}'});await settle(page);
  await expect(page.getByRole('button',{name:'记录第一次经期'})).toBeInViewport({ratio:1});
  for(const name of ['是','否','腹痛','疲惫','头痛','胸部胀痛','其他','开心','平静','焦虑','低落','易怒'])await expect(page.getByRole('button',{name,exact:true})).toBeInViewport({ratio:1});
  await noPageOverflow(page);const nav=await page.locator('.bottom-nav').boundingBox(),daily=await page.locator('.period-daily').boundingBox();expect(daily!.y+daily!.height).toBeLessThanOrEqual(nav!.y+1);
  const summary=await page.locator('.period-summary').boundingBox(),add=await page.getByRole('button',{name:'记录第一次经期'}).boundingBox();expect(add!.y+add!.height).toBeLessThanOrEqual(summary!.y+summary!.height);
  await shot(page,'period-360x740-empty-safe24');
});
for(const height of [480,640])test(`short screen ${height} with 150 percent font scrolls safely`,async({page})=>{
  await page.setViewportSize({width:360,height});await seed(page);
  for(const name of all){const button=page.getByRole('button',{name,exact:true});await button.scrollIntoViewIfNeeded();await expect(button).toBeInViewport({ratio:1});}
  await shot(page,`period-360x${height}-normal`);
  await page.locator('.period-page :is(h1,h2,h3,p,span,small,b,strong,button)').evaluateAll(elements=>{const sizes=elements.map(el=>parseFloat(getComputedStyle(el).fontSize)*1.5);elements.forEach((el,i)=>(el as HTMLElement).style.setProperty('font-size',sizes[i]+'px','important'));});await settle(page);
  expect(await page.locator('.period-page').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  for(const name of all){const button=page.getByRole('button',{name,exact:true});await button.scrollIntoViewIfNeeded();await expect(button).toBeInViewport({ratio:1});}
  expect(await page.evaluate(()=>document.body.scrollWidth)).toBe(360);
  await shot(page,`period-360x${height}-font150-bottom`);await page.locator('.period-page').evaluate(el=>el.scrollTop=0);await shot(page,`period-360x${height}-font150-top`);
});
for(const width of [393,900])test(`today and chosen backgrounds stay connected at width ${width}`,async({page})=>{
  await page.setViewportSize({width,height:932});await seed(page);await page.clock.setSystemTime(new Date('2026-10-23T04:00:00Z'));await page.reload();await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await settle(page);
  const edges=await page.locator('.period-date').evaluateAll(nodes=>nodes.filter(el=>/^2026-10-2[23]/.test(el.getAttribute('aria-label')||'')).map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),b=getComputedStyle(el,'::before');return {left:r.left+parseFloat(s.borderLeftWidth)+parseFloat(b.left),right:r.right-parseFloat(s.borderRightWidth)-parseFloat(b.right),color:b.backgroundColor};}));
  await expect(page.locator('.period-date.today.chosen.actual')).toHaveAttribute('aria-label',/^2026-10-23/);expect(edges).toHaveLength(2);expect(edges[0].right).toBeGreaterThanOrEqual(edges[1].left);expect(edges[0].color).toBe(edges[1].color);
});
test('bands break at weeks and months, preserve palette and real status priority',async({page})=>{
  await page.setViewportSize({width:393,height:852});const data:PeriodData={...emptyData(),periods:[{id:'band',start:'2026-09-25',end:'2026-10-04'},{id:'recent',start:'2026-10-20',end:'2026-10-25'}]};await seed(page,data);
  const cell=(date:string)=>page.getByRole('button',{name:new RegExp(`^${date}`)});
  await expect(cell('2026-10-01')).toHaveClass(/band-start/);await expect(cell('2026-10-03')).toHaveClass(/band-end/);await expect(cell('2026-10-04')).toHaveClass(/band-single/);
  await expect(cell('2026-10-25')).toHaveClass(/actual/);await expect(cell('2026-10-25')).not.toHaveClass(/predicted|fertile|ovulation/);
  async function bandEdges(date:string) {return cell(date).evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),b=getComputedStyle(el,'::before');return {left:r.left+parseFloat(s.borderLeftWidth)+parseFloat(b.left),right:r.right-parseFloat(s.borderRightWidth)-parseFloat(b.right)};});}
  // Oct 22 is selected; Oct 25 is today. Both must retain a connected band.
  await cell('2026-10-22').click();
  for(const [left,right] of [['2026-10-21','2026-10-22'],['2026-10-22','2026-10-23']])expect((await bandEdges(left)).right).toBeGreaterThanOrEqual((await bandEdges(right)).left);
  expect(await cell('2026-10-25').evaluate(el=>getComputedStyle(el,'::before').backgroundColor)).toBe(await page.locator('.period-legend i.actual').evaluate(el=>getComputedStyle(el).backgroundColor));
  for(const kind of ['fertile','ovulation']) {
    const day=page.locator(`.period-date.${kind}`).first();await expect(day).toBeVisible();
    expect(await day.evaluate((el,k)=>getComputedStyle(el,k==='ovulation'?undefined:'::before').backgroundColor,kind)).toBe(await page.locator(`.period-legend i.${kind}`).evaluate(el=>getComputedStyle(el).backgroundColor));
  }
  await shot(page,'period-band-crossmonth');
  await page.getByRole('button',{name:'下个月',exact:true}).click();await settle(page);
  for(const kind of ['predicted']) {
    const day=page.locator(`.period-date.${kind}:not(.outside)`).first();await expect(day).toBeVisible();
    expect(await day.evaluate((el,k)=>getComputedStyle(el,k==='ovulation'?undefined:'::before').backgroundColor,kind)).toBe(await page.locator(`.period-legend i.${kind}`).evaluate(el=>getComputedStyle(el).backgroundColor));
  }
  await shot(page,'period-band-palette');
});

