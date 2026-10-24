// Run against isolated built baseline/candidate preview servers after the M5 gate.
// Usage: node docs/integration/m5-visual.mjs http://127.0.0.1:5195 http://127.0.0.1:5196
import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const [baselineURL,candidateURL]=process.argv.slice(2);
const out=process.env.M5_VISUAL_OUT || 'artifacts/integration/m5/visual';mkdirSync(out,{recursive:true});
const sizes=[[360,740],[393,852],[430,932]], time='2026-10-23T04:00:00Z';
const browser=await chromium.launch();const files=[], comparisons=[], builds={};
async function shot(page,name){const path=`${out}/${name}.png`;await page.screenshot({path,animations:'disabled'});files.push({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});}
async function settle(page){await expect.poll(()=>page.evaluate(()=>[...document.fonts].some(f=>f.family==='Yozai'&&f.status==='loaded'))).toBe(true);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));});await page.waitForTimeout(300);}
for(const [width,height] of sizes){
 for(const [kind,url] of [['baseline',baselineURL],['candidate',candidateURL]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(time)});await page.addInitScript(()=>{localStorage.setItem('cozy-days.font-family','yozai');localStorage.setItem('cozy-days.settings-hint-seen','1');});await page.goto(url); builds[kind]=await (await page.request.get(url+'/review/build-info.json')).json();expect(builds[kind].commit).toBe(kind==='baseline'?'b059b6d9982062958f0a866e763f84383d69430d':execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());
  await expect(page.getByRole('button',{name:'新增待办',exact:true})).toBeVisible();
  await page.evaluate(async()=>{const req=indexedDB.open('little-days');await new Promise((resolve,reject)=>{req.onsuccess=()=>{const db=req.result;const tx=db.transaction(['todos','categories'],'readwrite');const categories=tx.objectStore('categories');const c=categories.getAll();c.onsuccess=()=>{const categoryId=c.result.find(r=>r.name==='生活')?.id??c.result[0].id;const rows=[['午后读几页喜欢的书','taskBook','cream'],['晚上散步十分钟','taskStretch','sage'],['整理桌面，给自己一点空间','home','rose']];rows.forEach(([text,illustrationId,theme],i)=>tx.objectStore('todos').put({id:i+1,text,date:'2026-10-23',completed:false,createdAt:1792728000000+i,categoryId,time:i===0?'15:30':undefined,decoration:{version:1,seed:100+i,illustrationId,stickerId:'flower',theme}}));};tx.oncomplete=()=>{db.close();resolve(null);};tx.onerror=()=>reject(tx.error);};req.onerror=()=>reject(req.error);});});
  await page.reload();await expect(page.getByTestId('todo-card')).toHaveCount(3);await settle(page);await shot(page,`todo-${kind}-${width}x${height}`);
  if(kind==='candidate'){
   await page.getByRole('navigation').getByRole('button',{name:'纪念日',exact:true}).click();await page.getByRole('button',{name:'新增纪念日',exact:true}).click();await page.getByLabel('纪念日名称').fill('我们的第一次旅行');await page.getByLabel('日期',{exact:true}).fill('2024-11-01');await page.getByRole('button',{name:'保存纪念日',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await settle(page);await shot(page,`anniversary-${width}x${height}`);await page.getByTestId('anniversary-card').scrollIntoViewIfNeeded();await settle(page);await shot(page,`anniversary-card-${width}x${height}`);
   await page.getByRole('navigation').getByRole('button',{name:'生理期',exact:true}).click();await page.getByRole('button',{name:'记录第一次经期',exact:true}).click();await page.getByLabel('开始日期',{exact:true}).fill('2026-10-20');await page.getByRole('button',{name:'保存经期记录'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.locator('.period-page').evaluate(el=>el.scrollTop=0);await settle(page);await shot(page,`period-header-${width}x${height}`);await page.locator('.period-daily').scrollIntoViewIfNeeded();await settle(page);await shot(page,`period-diary-${width}x${height}`);
  }
  expect(errors).toEqual([]);await context.close();
 }
 const page=await browser.newPage();const a=readFileSync(`${out}/todo-baseline-${width}x${height}.png`).toString('base64'),b=readFileSync(`${out}/todo-candidate-${width}x${height}.png`).toString('base64');
 const result=await page.evaluate(async({a,b})=>{const load=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.src='data:image/png;base64,'+src;});const images=await Promise.all([load(a),load(b)]);const canvas=document.createElement('canvas');canvas.width=images[0].width;canvas.height=images[0].height;const ctx=canvas.getContext('2d');const arrays=images.map(i=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(i,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;});let changedPixels=0,maxChannelDelta=0;const diff=ctx.createImageData(canvas.width,canvas.height);for(let i=0;i<arrays[0].length;i+=4){let changed=false;for(let j=0;j<4;j++){const delta=Math.abs(arrays[0][i+j]-arrays[1][i+j]);maxChannelDelta=Math.max(maxChannelDelta,delta);changed ||= delta!==0;}if(changed){changedPixels++;diff.data[i]=255;diff.data[i+3]=255;}}ctx.putImageData(diff,0,0);return {changedPixels,totalPixels:canvas.width*canvas.height,maxChannelDelta,diff:canvas.toDataURL().split(',')[1]};},{a,b});
 writeFileSync(`${out}/todo-diff-${width}x${height}.png`,Buffer.from(result.diff,'base64'));delete result.diff;comparisons.push({width,height,...result});await page.close();
}
await browser.close();
writeFileSync(`${out}/source.json`,JSON.stringify({sourceCommit:builds.candidate.commit,actualBuildCommit:builds.candidate.commit,appLogicSourceSha:builds.candidate.commit,builds,baselineCommit:'b059b6d9982062958f0a866e763f84383d69430d',time,timezone:'Asia/Shanghai',font:'yozai',deviceScaleFactor:1,seeds:[100,101,102],synthetic:true,files,comparisons},null,2)+'\n');
console.log(JSON.stringify(comparisons,null,2));
