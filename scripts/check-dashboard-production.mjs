import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { blankRow } from '../src/lib/domain.ts';

export async function verifyDashboardAndRecurring(page, original, ledgerPath) {
  const origin = new URL(page.url()).origin;
  const nav = page.getByRole('navigation', { name: '가계부 메뉴' });
  const initial = await (await page.request.get(ledgerPath)).json();
  const month = original.date.slice(0, 7);
  const category = kind => initial.categories.find(c => c.kind === kind).id;
  const extra = [
    { kind: 'income', amount: '10,000', status: 'confirmed' },
    { kind: 'saving', amount: '2,000', status: 'confirmed' },
    { kind: 'refund', amount: '200', status: 'confirmed', original_transaction_id: original.id },
    { kind: 'expense', amount: '9,000', status: 'cancelled' },
    { kind: 'income', amount: '5,000', status: 'planned' },
  ].map((value, index) => ({ ...blankRow('상화', month, initial.categories), description: '화면검증-' + index, ...value, category_id: value.kind === 'refund' ? original.category_id : category(value.kind) }));
  const write = async (path, data) => {
    let reply;
    try { reply = await page.request.post(path, { headers: { origin }, data: { request_id: randomUUID(), ...data } }); }
    catch { throw new Error('Fixture request failed at ' + path + '; request cookies are omitted.'); }
    assert.equal(reply.status(), 200, 'Fixture write must succeed: ' + await reply.text());
    return reply.json();
  };
  await write('/api/transactions', { upserts: extra, deletes: [] });
  const rules = [];
  for (const [owner, amount] of [['상화', '500'], ['하율', '700']]) {
    const rule = { name: owner + ' 고정비 검증', owner, kind: 'expense', category_id: original.category_id, amount, effective_month: month, start_month: month, end_month: month, day: 28, interval_months: 1, enabled: true, account_id: null, payment_method_id: null };
    const reply = await write('/api/recurring', { rule });
    rules.push({ ...rule, rule_id: reply.rule_id });
  }
  await write('/api/budgets', { budgets: [{ id: randomUUID(), month, owner: '상화', category_id: original.category_id, amount: '600', label: '화면 검증', version: 0 }] });
  await mkdir('artifacts', { recursive: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.getByRole('heading', { name: '집계표', exact: true }).waitFor();
    await page.getByRole('button', { name: '달력월', exact: true }).click();
    await page.getByLabel('조회 연월', { exact: true }).fill(month);
    await page.locator('.selected-period-tools>summary').click();
    await page.getByRole('heading', { name: /우리 집 돈 한눈에/ }).waitFor();
    await expect(page.getByTestId('dashboard-income').locator('strong')).toHaveText('10,000원');
    await expect(page.getByTestId('dashboard-expense').locator('strong')).toHaveText('800원');
    await expect(page.getByTestId('dashboard-allocation').locator('strong')).toHaveText('2,000원');
    await expect(page.getByTestId('dashboard-remaining').locator('strong')).toHaveText('7,200원');
    await expect(page.getByTestId('dashboard-budget-remaining')).toHaveText('200원');
    await expect(page.getByText('예산보다 더 썼어요', { exact: true })).toBeVisible();
    await expect(page.locator('.planned-summary')).toContainText('1,200원');
    await expect(page.locator('.planned-summary')).toContainText('6,000원');
    await expect(page.locator('.upcoming-list li')).toHaveCount(2);
    await expect(page.locator('.dashboard-details>details[open]')).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Dashboard must not overflow the viewport');
    await page.screenshot({ path: 'artifacts/dashboard-' + width + '.png', fullPage: true });
    await page.getByRole('button', { name: '이번 달 예산 설정 →', exact: true }).click();
    await expect(page.locator('#budget-editor')).toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: '+ 예산 행 추가', exact: true })).toBeVisible();
    await page.locator('#budget-editor>summary').click();
    await page.getByRole('button', { name: '연간 비교 펼치기', exact: true }).click();
    if (await page.locator('.selected-period-tools').getAttribute('open') === null) await page.locator('.selected-period-tools>summary').click();
    await expect(page.locator('.annual-overview tbody tr')).toHaveCount(12);
    await page.getByRole('button', { name: '연간 비교 접기', exact: true }).click();
    for (const owner of ['상화', '하율']) {
      await nav.getByRole('button').filter({ hasText: owner + ' 가계부' }).click();
      const fixed = page.locator('tr[data-recurring="true"]');
      await expect(fixed).toHaveCount(1);
      await expect(fixed.locator('.sheet-recurring-tag')).toHaveText('고정비');
      const background = await fixed.locator('td').first().evaluate(cell => getComputedStyle(cell).backgroundColor);
      assert.equal(background, 'rgb(255, 245, 207)', 'Sticky selection cell should remain pale yellow');
      const textInput = fixed.locator('input[aria-label$="행 내용"]');
      await textInput.fill(owner + ' 고정비 변경 검증');
      await expect(textInput.locator('..')).toHaveClass(/edited/);
      assert.equal(await textInput.locator('..').evaluate(cell => getComputedStyle(cell).backgroundColor), 'rgb(255, 243, 207)');
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: '변경 취소', exact: true }).click();
      await fixed.locator('.row-selector input').check();
      await page.getByRole('button', { name: '선택 복사', exact: true }).click();
      await expect(page.locator('tr[data-recurring="true"]')).toHaveCount(1);
      await expect(page.locator('tr.new-row .sheet-recurring-tag')).toHaveCount(0);
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('button', { name: '변경 취소', exact: true }).click();
      await page.screenshot({ path: 'artifacts/recurring-' + owner + '-' + width + '.png' });
    }
    console.log('Dashboard accounting, refund and status handling, budget warning, disclosure controls, annual comparison, recurring highlighting and copy behavior passed at ' + width + 'px');
  }
  assert.deepEqual(errors, [], 'No browser errors');
  const latest = await (await page.request.get(ledgerPath)).json();
  await write('/api/transactions', { upserts: [], deletes: latest.transactions.filter(t => t.id !== original.id).map(t => ({ id: t.id, version: t.version })) });
  await write('/api/budgets', { budgets: latest.budgets.map(b => ({ ...b, amount: '0' })) });
  await nav.getByRole('button').filter({ hasText: '집계표' }).click();
}
