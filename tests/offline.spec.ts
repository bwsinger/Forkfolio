import { test, expect } from '@playwright/test';

test('cold offline navigation, version editing, cooking notes/photos, restart and exactly-once sync', async ({
  page,
  context,
  browser
}) => {
  await page.goto('/settings');
  await expect(
    page.getByRole('heading', { name: 'Your book, your device.' })
  ).toBeVisible();
  await page
    .getByLabel('Owner secret')
    .fill('forkfolio-automated-test-secret-only');
  await page.getByRole('button', { name: 'Sign in & sync' }).click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((r) =>
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => r(),
          { once: true }
        )
      );
  });
  await page.goto('/recipe/cinnamon');
  await page.getByRole('button', { name: '½ Half' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing 0.5×' })
  ).toContainText('6 rolls · 1 pan');
  await page.getByLabel('Recipe ratio', { exact: true }).fill('1/0');
  await expect(
    page.getByText('Last valid amounts remain shown.', { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing 0.5×' })
  ).toContainText('6 rolls');
  await context.setOffline(true);
  await page.close();
  page = await context.newPage();
  await page.goto('/recipe/cinnamon');
  await expect(
    page.getByRole('heading', { name: 'Cinnamon rolls', exact: true })
  ).toBeVisible();
  await page.getByRole('link', { name: 'Edit recipe', exact: true }).click();
  await page
    .getByLabel('Recipe name', { exact: true })
    .fill('Cinnamon rolls, tested offline');
  await page.getByRole('button', { name: 'Save recipe version' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Cinnamon rolls, tested offline',
      exact: true
    })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Start cooking', exact: true })
    .click();
  await page
    .getByRole('link', { name: 'Finish & add notes', exact: true })
    .click();
  await page
    .getByLabel('Your cooking notes', { exact: true })
    .fill('The crumb stayed soft. Try a little less sugar.');
  await page.getByLabel('Choose photos').setInputFiles('static/icon-192.png');
  await expect(page.getByAltText('Cooking attempt photo 1')).toBeVisible();
  await page
    .getByRole('button', { name: 'Save cooking notes', exact: true })
    .click();
  await expect(
    page.getByText('The crumb stayed soft. Try a little less sugar.', {
      exact: true
    })
  ).toBeVisible();
  await page.close();
  page = await context.newPage();
  await page.goto('/history/cinnamon');
  await expect(
    page.getByText('The crumb stayed soft. Try a little less sugar.', {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByAltText('Recipe photo 1')).toBeVisible();
  await page.route(
    '**/api/sync',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 }
  );
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(
    page.getByText('Server unavailable', { exact: false })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  const second = await browser.newContext();
  const p = await second.newPage();
  await p.goto('/settings');
  await p
    .getByLabel('Owner secret')
    .fill('forkfolio-automated-test-secret-only');
  await p.getByRole('button', { name: 'Sign in & sync' }).click();
  await expect(p.getByText('Synced', { exact: true })).toBeVisible();
  await p.goto('/history/cinnamon');
  await expect(
    p.getByText('The crumb stayed soft. Try a little less sugar.', {
      exact: true
    })
  ).toHaveCount(1);
  await expect(p.getByAltText('Recipe photo 1')).toBeVisible();
  await second.close();
});

test('source drafts and ordered photos persist offline across a restart', async ({
  page,
  context
}) => {
  await page.goto('/sources');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page
    .getByLabel('Recipe text', { exact: true })
    .fill('Country bread recipe');
  await page
    .getByLabel('What should we import?')
    .fill('Bread only, not the pie.');
  await page.getByLabel('Choose photos').setInputFiles('static/icon-192.png');
  await expect(page.getByAltText('Cookbook page 1')).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Source draft saved' })
  ).toBeVisible();
  await page.close();
  page = await context.newPage();
  await page.goto('/sources');
  await expect(page.getByLabel('Recipe text', { exact: true })).toHaveValue(
    'Country bread recipe'
  );
  await expect(page.getByLabel('What should we import?')).toHaveValue(
    'Bread only, not the pie.'
  );
  await expect(page.getByAltText('Cookbook page 1')).toBeVisible();
  await page.getByRole('button', { name: 'Save source for import' }).click();
  await expect(
    page.getByText('Bread only, not the pie.', { exact: true })
  ).toBeVisible();
});

test('private endpoints reject anonymous, cross-origin, and invalid data', async ({
  request
}) => {
  expect(
    (
      await request.post('/api/sync', {
        data: { operations: [] },
        headers: { Origin: 'http://127.0.0.1:4173' }
      })
    ).status()
  ).toBe(401);
  expect(
    (
      await request.post('/api/session', {
        data: { secret: 'forkfolio-automated-test-secret-only' },
        headers: { Origin: 'https://other.example' }
      })
    ).status()
  ).toBe(403);
  const login = await request.post('/api/session', {
    data: { secret: 'forkfolio-automated-test-secret-only' },
    headers: { Origin: 'http://127.0.0.1:4173' }
  });
  expect(login.ok()).toBeTruthy();
  expect(
    (
      await request.post('/api/sync', {
        data: { operations: [{ kind: 'publish', id: 'broken' }] },
        headers: { Origin: 'http://127.0.0.1:4173' }
      })
    ).status()
  ).toBe(400);
});

test('failed local publication preserves the editable draft and reports storage failure', async ({
  page
}) => {
  await page.goto('/edit/cinnamon');
  await page
    .getByLabel('Recipe name', { exact: true })
    .fill('An unsaved storage experiment');
  await expect(
    page.getByRole('status').filter({ hasText: 'Draft saved on this device' })
  ).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (
      ...args: Parameters<IDBObjectStore['add']>
    ) {
      if (this.name === 'outbox') {
        IDBObjectStore.prototype.add = original;
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Save recipe version' }).click();
  await expect(page.getByRole('alert').first()).toContainText('Storage full');
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'An unsaved storage experiment'
  );
  await page.reload();
  await expect(page.getByLabel('Recipe name', { exact: true })).toHaveValue(
    'An unsaved storage experiment'
  );
});

test('a late sync response cannot replace a newer snapshot from another tab', async ({
  page,
  context
}) => {
  await page.goto('/settings');
  await page
    .getByLabel('Owner secret')
    .fill('forkfolio-automated-test-secret-only');
  await page.getByRole('button', { name: 'Sign in & sync' }).click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.goto('/edit/cinnamon');
  await page
    .getByLabel('Recipe name', { exact: true })
    .fill('First tab version B');
  await page.getByRole('button', { name: 'Save recipe version' }).click();
  await expect(
    page.getByRole('heading', { name: 'First tab version B', exact: true })
  ).toBeVisible();
  await expect(
    page.getByText('Server unavailable', { exact: false })
  ).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let committed!: () => void;
  const sent = new Promise<void>((resolve) => (committed = resolve));
  await page.route(
    '**/api/sync',
    async (route) => {
      const response = await route.fetch();
      committed();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 }
  );
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await sent;
  const other = await context.newPage();
  await other.goto('/recipe/cinnamon');
  await expect(other.getByText('Synced', { exact: true })).toBeVisible();
  await other.getByRole('link', { name: 'Edit recipe', exact: true }).click();
  await other
    .getByLabel('Recipe name', { exact: true })
    .fill('Second tab version C');
  await other.getByRole('button', { name: 'Save recipe version' }).click();
  await expect(other.getByText('Synced', { exact: true })).toBeVisible();
  release();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Second tab version C', exact: true })
  ).toBeVisible();
  await other.close();
});
