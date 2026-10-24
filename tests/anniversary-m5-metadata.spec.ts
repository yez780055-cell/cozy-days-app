import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';

test('anniversary manifest SHA matches canonical git bytes and served resource bytes', async ({ page }) => {
  const dir='public/assets/cozy_days/anniversary';
  const manifest=await (await page.request.get('/assets/cozy_days/anniversary/manifest.json')).json();
  const items=manifest.items.filter((item:{file?:string})=>item.file);
  expect(items).toHaveLength(6);
  for(const item of items) {
    const path=posix.normalize(`${dir}/${item.file}`);
    const canonical=execFileSync('git',['show',`HEAD:${path}`],{maxBuffer:16*1024*1024});
    const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
    const response=await page.request.get('/'+path.replace(/^public\//,''));
    expect(response.ok()).toBeTruthy();
    const body=await response.body();
    // git stores SVG with LF; Windows checkout serving may add CRLF.
    const served=path.endsWith('.svg')?Buffer.from(body.toString('utf8').replace(/\r\n/g,'\n')):body;
    expect.soft(item.sha256,`${item.id}: manifest vs git bytes`).toBe(hash(canonical));
    expect.soft(item.sha256,`${item.id}: manifest vs served canonical bytes`).toBe(hash(served));
  }
});
