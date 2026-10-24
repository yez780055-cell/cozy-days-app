import { test, expect } from '@playwright/test';

test('four scrapbook categories fit at phone widths and remain scrollable', async ({ browser }) => {
  const sizes = [{width:360,height:800},{width:393,height:852},{width:430,height:900}];
  for (const size of sizes) {
    const page=await browser.newPage({viewport:size,timezoneId:'Asia/Shanghai'});
    await page.clock.setFixedTime(new Date('2026-10-24T12:00:00+08:00'));
    await page.addInitScript(()=>localStorage.setItem('cozy-days.settings-hint-seen','1'));
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button',{name:'纪念日',exact:true}).click();
    for (const [name,date,theme,color] of [['我们一起走过的第一个春天纪念日','2023-05-20','恋爱','粉色'],['妈妈生日','2000-11-08','生日','奶黄'],['养猫一周年','2024-01-15','宠物','淡紫'],['毕业纪念日','2022-06-30','成长','薄荷绿']]) {
      await page.getByRole('button',{name:'新增纪念日',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:'新增纪念日',exact:true});
      await dialog.getByLabel('纪念日名称').fill(name);
      await dialog.getByLabel('日期',{exact:true}).fill(date);
      await dialog.locator('select').first().selectOption({label:theme});
      if (name==='毕业纪念日') await dialog.getByLabel('每年重复').uncheck();
      await dialog.getByRole('button',{name:color,exact:true}).click();
      await dialog.getByLabel('备注',{exact:true}).fill(name.startsWith('我们一起')?'谢谢你一直在我的生活里，和你一起的每一天都值得珍藏。那天的晚风、路边的小花和一路上的笑声，我一直记得。愿今后每一个普通的日子，也都能和你一起慢慢度过。':'谢谢你一直在我的生活里，和你一起的每一天都值得珍藏。');
      await dialog.getByRole('button',{name:'保存纪念日',exact:true}).click();
      await expect(dialog).not.toBeVisible();
    }
    await expect(page.getByTestId('anniversary-card')).toHaveCount(4);
    await expect(page.getByTestId('anniversary-card').filter({hasText:'每年重复'})).toHaveCount(3);
    await expect(page.getByTestId('anniversary-card').filter({hasText:'单次纪念'})).toHaveCount(1);
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
    await page.screenshot({path:`artifacts/v021-g4/anniversary-${size.width}-top.png`,fullPage:false});
    await page.locator('.ann-page').evaluate(el=>el.scrollTo(0,el.scrollHeight));
    await page.waitForTimeout(150);
    await page.screenshot({path:`artifacts/v021-g4/anniversary-${size.width}-scroll.png`,fullPage:false});
    expect(await page.locator('.ann-page').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    const lastCard = page.getByTestId('anniversary-card').last();
    expect(await lastCard.evaluate(card=>card.scrollWidth<=card.clientWidth)).toBe(true);
    await page.getByRole('button',{name:'月视图',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'月视图'})).toBeVisible();
    await page.waitForTimeout(200);
    await page.screenshot({path:`artifacts/v021-g4/anniversary-${size.width}-month.png`,fullPage:false,animations:'disabled'});
    await page.close();
  }
});
