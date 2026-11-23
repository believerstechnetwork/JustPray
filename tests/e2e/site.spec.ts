import { expect, test, type Page } from '@playwright/test';

const fillRegistration = async (page: Page, email = 'ada@example.com') => {
  await page.getByLabel('Full name *').fill('Ada Obi');
  await page.getByLabel('Email *').fill(email);
  await page.getByLabel('WhatsApp number *').fill('+234 801 234 5678');
  await page.getByLabel('My details may be used').check();
};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  test.info().annotations.push({ type: 'errors', description: 'checked in afterEach' });
  (page as Page & { _errors?: string[] })._errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { _errors?: string[] })._errors ?? []).toEqual([]);
});

test('home page shows the hero, seat count and key sections', async ({ page }) => {
  await expect(page).toHaveTitle(/Just Pray/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Once a month, we stop and pray.',
  );
  await expect(page.getByRole('img', { name: /seats reserved/ })).toHaveAttribute(
    'aria-label',
    '86 of 120 seats reserved, 34 left',
  );
  await expect(page.getByRole('heading', { name: 'The burden' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The goal' })).toBeVisible();
  await expect(page.getByText('Ezekiel 22:30 (KJV)')).toBeVisible();
});

test('all page images load', async ({ page }) => {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForLoadState('networkidle');
  const broken = await page.$$eval('img', (imgs) =>
    imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.alt),
  );
  expect(broken).toEqual([]);
});

test('reserving a seat shows the pass and updates the seat count', async ({ page }) => {
  await page.getByRole('button', { name: 'Reserve a seat' }).first().click();
  await expect(page).toHaveURL(/#\/register$/);
  await fillRegistration(page);
  await page.getByRole('button', { name: 'Reserve my seat' }).click();

  await expect(page).toHaveURL(/#\/confirmed$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're in, Ada.");
  await expect(page.getByText('JP-0087')).toBeVisible();
  await expect(page.getByText('87 of 120 reserved')).toBeVisible();
});

test('registration shows errors and keeps the user on the form', async ({ page }) => {
  await page.goto('/#/register');
  await page.getByLabel('Full name *').fill('Ada Obi');
  await page.getByLabel('Email *').fill('not-an-email');
  await page.getByLabel('WhatsApp number *').fill('123');
  await page.getByRole('button', { name: 'Reserve my seat' }).click();

  await expect(page).toHaveURL(/#\/register$/);
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText(/WhatsApp number with country code/).first()).toBeVisible();
  await expect(page.getByText('Please agree so we can manage your reservation.')).toBeVisible();
});

test('registering twice with the same email does not take a second seat', async ({ page }) => {
  await page.goto('/#/register');
  await fillRegistration(page);
  await page.getByRole('button', { name: 'Reserve my seat' }).click();
  await expect(page.getByText('JP-0087')).toBeVisible();

  await page.goto('/#/register');
  await fillRegistration(page);
  await page.getByRole('button', { name: 'Reserve my seat' }).click();
  await expect(page.getByText('87 of 120 reserved')).toBeVisible();
});

test('the confirmation page is not reachable without a reservation', async ({ page }) => {
  await page.goto('/#/confirmed');
  await expect(page).toHaveTitle(/Reserve a seat/);
});

test('support flow: amount validation then bank transfer steps', async ({ page }) => {
  await page.goto('/#/support');
  await page.getByRole('button', { name: '₦10,000' }).click();
  await expect(page.getByLabel('Amount (₦)')).toHaveValue('10000');

  await page.getByLabel('Amount (₦)').fill('50');
  await page.getByLabel('Email for your receipt').fill('giver@example.com');
  await page.getByRole('button', { name: 'Pay by bank transfer' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter at least ₦100.');

  // The typed email survives the validation error.
  await expect(page.getByLabel('Email for your receipt')).toHaveValue('giver@example.com');
  await page.getByLabel('Amount (₦)').fill('2500');
  await page.getByRole('button', { name: 'Pay by bank transfer' }).click();
  await expect(page.getByText('Transfer the exact amount')).toBeVisible();
  await page.getByRole('button', { name: "I've sent it" }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for confirmation' })).toBeVisible();
});

test('share dialog opens, generates an image and closes with Escape', async ({
  page,
  isMobile,
}) => {
  if (isMobile) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.locator('#mnav').getByRole('button', { name: 'Share' }).click();
  } else {
    await page.locator('.nav').getByRole('button', { name: 'Share', exact: true }).click();
  }
  const dialog = page.getByRole('dialog', { name: 'Share Just Pray' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#scard')).toHaveAttribute('src', /^data:image\/png/);
  await expect(dialog.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\//,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('organiser can edit the gathering and the public page reflects it', async ({ page }) => {
  await page.goto('/#/admin');
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  await page.getByLabel('Venue').fill('Landmark Centre, Lagos');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/#/home');
  await expect(page.locator('.date-txt')).toContainText('Landmark Centre, Lagos');
});

test('dark mode toggle switches the theme', async ({ page }) => {
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
});

test('mobile navigation menu opens and routes', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('#mnav').getByRole('button', { name: 'Support' }).click();
  await expect(page).toHaveURL(/#\/support$/);
});

test('no horizontal scroll on the home page', async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
