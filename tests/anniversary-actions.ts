import { expect, type Locator } from '@playwright/test';

export async function chooseDate(form: Locator, key: string) {
  await form.getByRole('button', { name: '选择日期', exact: true }).click();
  const picker = form.getByRole('region', { name: '选择日期' });
  await picker.getByRole('button', { name: '公历', exact: true }).click();
  const [year, month, day] = key.split('-').map(Number);
  for (const [label, value, index] of [['年', year, year - 1000], ['月', month, month - 1], ['日', day, day - 1]] as const) {
    const wheel = picker.getByRole('listbox', { name: label, exact: true });
    await wheel.evaluate((element, index) => { element.scrollTop = index * 40; }, index);
    await expect(wheel).toHaveAttribute('aria-activedescendant', `ann-${label}-${value}`);
  }
  await picker.getByRole('button', { name: '确定', exact: true }).click();
}
