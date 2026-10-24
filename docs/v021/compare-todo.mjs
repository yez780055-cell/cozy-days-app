import { chromium } from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const baselineRoot=process.env.TODO_BASELINE_DIR||'D:/cozy-days-v021-design/artifacts/v021-todo-baseline';
const browser=await chromium.launch();const page=await browser.newPage();const rows=[];
for(const [width,height] of [[360,740],[393,852],[430,932]]){
 const baseline=`${baselineRoot}/todo-${width}x${height}.png`,candidate=`public/review/v021/todo-${width}x${height}.png`;
 const a=readFileSync(baseline),b=readFileSync(candidate);
 const difference=await page.evaluate(async([a,b])=>{const decode=async s=>{const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {w:i.width,h:i.height,p:x.getImageData(0,0,i.width,i.height).data};};const x=await decode(a),y=await decode(b);let changedPixels=0;for(let i=0;i<x.p.length;i+=4)if([0,1,2,3].some(k=>x.p[i+k]!==y.p[i+k]))changedPixels++;return {width:x.w,height:x.h,changedPixels};},[a.toString('base64'),b.toString('base64')]);
 rows.push({...difference,baselineSHA256:createHash('sha256').update(a).digest('hex'),candidateSHA256:createHash('sha256').update(b).digest('hex')});
}await browser.close();writeFileSync('public/review/v021/todo-comparison.json',JSON.stringify({baselineSource:'6a36762dcaf6f46b70a309d281e29dc8c145d721',comparison:'Exact RGBA pixel equality; no threshold',rows},null,2));console.log(rows);if(rows.some(r=>r.changedPixels!==0))process.exitCode=1;
