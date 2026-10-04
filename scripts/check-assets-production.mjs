import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { koreaDate, koreaDateTime } from '../src/lib/domain.ts';

export async function verifyAssetsAndModification(page, tx, ledgerPath) {
  const nav = page.getByRole('navigation', { name: '가계부 메뉴' });
  const openAssets = async () => {
    await nav.getByRole('button').filter({ hasText: '자산·대출' }).click();
    await page.getByRole('heading', { name: '자산·대출', exact: true }).waitFor();
    await page.getByLabel('항목명', { exact: true }).waitFor();
  };
  assert.equal(await nav.getByRole('button').filter({ hasText: '가져오기' }).count(), 0, 'Import menu must be hidden');
  await openAssets();
  await expect(page.getByTestId('asset-total')).toHaveText('0원');
  const suffix = randomUUID().slice(0, 8), deposit = `검증예금-${suffix}`, loan = `검증대출-${suffix}`;
  const saveForm = async (button) => {
    const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/assets' && r.request().method() === 'POST');
    await page.getByRole('button', { name: button, exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), 200, `Asset save failed: ${await response.text()}`);
    await page.getByRole('status').filter({ hasText: '자산·대출 잔액을 저장했습니다.' }).waitFor();
  };
  for (const [name, kind, owner, balance] of [[deposit, 'deposit', '상화', '1,000,000'], [loan, 'loan', '하율', '400,000']]) {
    await page.getByLabel('항목명', { exact: true }).fill(name);
    await page.getByLabel('자산 종류', { exact: true }).selectOption(kind);
    await page.getByLabel('귀속', { exact: true }).selectOption(owner);
    await page.getByLabel('잔액 (원)', { exact: true }).fill(balance);
    await page.getByLabel('기준일', { exact: true }).fill(koreaDate());
    await saveForm('자산·대출 등록');
  }
  await expect(page.getByTestId('asset-total')).toHaveText('1,000,000원');
  await expect(page.getByTestId('loan-total')).toHaveText('400,000원');
  await expect(page.getByTestId('net-assets')).toHaveText('600,000원');
  await page.getByLabel('자산 귀속 필터', { exact: true }).selectOption('상화');
  await expect(page.getByTestId('net-assets')).toHaveText('1,000,000원');
  await page.getByLabel('자산 귀속 필터', { exact: true }).selectOption('');
  console.log('Asset and loan registration, family totals and attribution filtering passed');
  await page.reload(); await openAssets();
  await expect(page.getByTestId('net-assets')).toHaveText('600,000원');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('항목명', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `${deposit} 수정`, exact: true }).click();
  await page.getByLabel('잔액 (원)', { exact: true }).fill('1,200,000');
  await saveForm('수정 저장');
  await expect(page.getByTestId('net-assets')).toHaveText('800,000원');
  const snapshot = await (await page.request.get('/api/assets')).json();
  const current = snapshot.assets.find(a => a.name === deposit);
  assert.equal(current.version, 2); assert.equal(current.balance, 1200000);
  await expect(page.locator(`[data-asset-id="${current.id}"] time`)).toHaveText(koreaDateTime(current.updated_at));
  const conflict = await page.request.post('/api/assets', { headers: { origin: new URL(page.url()).origin }, data: { request_id: randomUUID(), upserts: [{ ...current, version: 1, balance: '1' }], deletes: [] } });
  assert.equal(conflict.status(), 409, 'Stale asset updates must not overwrite the latest balance');
  for (const name of [deposit, loan]) {
    page.once('dialog', dialog => dialog.accept());
    const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/assets' && r.request().method() === 'POST');
    await page.getByRole('button', { name: `${name} 삭제`, exact: true }).click();
    assert.equal((await pending).status(), 200);
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
  }
  await expect(page.getByTestId('net-assets')).toHaveText('0원');
  console.log('Mobile asset editing, persisted modification dates, conflict protection and deletion passed');
  await page.setViewportSize({ width: 1440, height: 900 });
  await nav.getByRole('button').filter({ hasText: '상화 가계부' }).click();
  const stamp = page.locator(`[data-testid="transaction-updated-at"][data-transaction-id="${tx.id}"]`);
  await expect(stamp).toHaveText(koreaDateTime(tx.updated_at));
  await page.getByLabel('1행 내용', { exact: true }).fill(`${tx.description} 수정`);
  const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/transactions' && r.request().method() === 'POST');
  await page.getByRole('button', { name: '변경사항 저장', exact: true }).click();
  const saved = await pending; assert.equal(saved.status(), 200, `Ledger edit failed: ${await saved.text()}`);
  await page.getByRole('status').filter({ hasText: '변경사항을 DB에 저장했습니다.' }).waitFor();
  const updated = (await (await page.request.get(ledgerPath)).json()).transactions.find(t => t.id === tx.id);
  assert.equal(updated.version, tx.version + 1);
  assert.ok(new Date(updated.updated_at) > new Date(tx.updated_at));
  await expect(stamp).toHaveText(koreaDateTime(updated.updated_at));
  await page.reload();
  await nav.getByRole('button').filter({ hasText: '상화 가계부' }).click();
  await expect(stamp).toHaveText(koreaDateTime(updated.updated_at));
  console.log('Ledger modification date updates immediately after save and persists after reload');
  return updated;
}
