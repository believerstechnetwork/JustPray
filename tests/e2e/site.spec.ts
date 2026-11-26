import { expect, test, type Page } from '@playwright/test';

// Every test shares one in-memory backend (vite preview + server/dev-api.ts), so each
// booking uses its own email and seat counts are compared relative to each other.
let counter = 0;
const uniqueEmail = (): string =>
  `ada${Date.now()}${counter++}${Math.random().toString(36).slice(2, 6)}@example.com`;

const seatCount = async (page: Page): Promise<number> => {
  const label = await page.getByRole('img', { name: /seats reserved/ }).getAttribute('aria-label');
  return Number(/^(\d+) of/.exec(label ?? '')?.[1]);
};

const fillRegistration = async (page: Page, email = uniqueEmail()) => {
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
    /^\d+ of 120 seats reserved, \d+ left$/,
  );
  await expect(page.locator('.date-txt')).toContainText('4:00 PM WAT');
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
  const before = await seatCount(page);
  await page.getByRole('button', { name: 'Reserve a seat' }).first().click();
  await expect(page).toHaveURL(/#\/register$/);
  const email = uniqueEmail();
  await fillRegistration(page, email);
  await page.getByRole('button', { name: 'Reserve my seat' }).click();

  await expect(page).toHaveURL(/#\/confirmed$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText("You're in, Ada.");
  await expect(page.getByText(/^JP-\d{4}$/)).toBeVisible();
  await expect(page.getByText(`We've emailed your confirmation to ${email}`)).toBeVisible();
  expect(await seatCount(page)).toBeGreaterThan(before);
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
  const email = uniqueEmail();
  await page.goto('/#/register');
  await fillRegistration(page, email);
  await page.getByRole('button', { name: 'Reserve my seat' }).click();
  await expect(page).toHaveURL(/#\/confirmed$/);

  await page.goto('/#/register');
  await fillRegistration(page, email);
  await page.getByRole('button', { name: 'Reserve my seat' }).click();
  await expect(page.getByText('This email already has a seat for this gathering.')).toBeVisible();
  await expect(page).toHaveURL(/#\/register$/);
});

test('a validation error keeps what the visitor typed', async ({ page }) => {
  await page.goto('/#/register');
  await page.getByLabel('Full name *').fill('Ada Obi');
  await page.getByLabel('Email *').fill('ada@example.com');
  await page.getByLabel('Tell me about future Just Pray gatherings.').check();
  await page.getByRole('button', { name: 'Reserve my seat' }).click();
  await expect(page.getByText('Please agree so we can manage your reservation.')).toBeVisible();
  await expect(page.getByLabel('Tell me about future Just Pray gatherings.')).toBeChecked();
  await expect(page.getByLabel('Full name *')).toHaveValue('Ada Obi');
  await expect(page.getByLabel('Email *')).toHaveValue('ada@example.com');
});

test('the confirmation page is not reachable without a reservation', async ({ page }) => {
  await page.goto('/#/confirmed');
  await expect(page).toHaveTitle(/Reserve a seat/);
});

test('support flow: amount validation, bank details with a reference, then thanks', async ({
  page,
}) => {
  await page.goto('/#/support');
  await page.getByRole('button', { name: '₦10,000' }).click();
  await expect(page.getByLabel('Amount (₦)')).toHaveValue('10000');

  await page.getByLabel('Amount (₦)').fill('50');
  await page.getByLabel('Name on your bank account').fill('Ada Obi');
  await page.getByLabel('Email').fill('giver@example.com');
  await page.getByRole('button', { name: 'Show bank details' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter at least ₦100.');

  // What was typed survives the validation error.
  await expect(page.getByLabel('Email')).toHaveValue('giver@example.com');
  await page.getByLabel('Amount (₦)').fill('2500');
  await page.getByRole('button', { name: 'Show bank details' }).click();
  await expect(page.getByText('Transfer ₦2,500 to our naira account below.')).toBeVisible();
  await expect(page.locator('.panel').getByText('0000000000')).toBeVisible();
  const reference = (await page.locator('.panel .copyval.code').last().textContent()) ?? '';
  expect(reference).toMatch(/^JP-[A-Z0-9]{5}$/);
  await page.getByRole('button', { name: "I've sent it" }).click();
  await expect(page.getByRole('heading', { name: 'Thank you, Ada.' })).toBeVisible();
  await expect(page.getByText(reference)).toBeVisible();
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

const signIn = async (page: Page) => {
  await page.goto('/#/admin');
  await page.getByLabel('Password').fill('dev-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
};

test('the support page lists both accounts', async ({ page }) => {
  await page.goto('/#/support');
  const accounts = page.locator('.accts');
  await expect(accounts.getByRole('heading', { name: 'Naira account (₦)' })).toBeVisible();
  await expect(accounts.getByRole('heading', { name: 'Dollar account ($)' })).toBeVisible();
  await expect(accounts.getByText('0000000000')).toBeVisible();
  await expect(accounts.getByText('1111111111')).toBeVisible();
});

test('dollar contributions show the dollar account', async ({ page }) => {
  await page.goto('/#/support');
  await page.getByRole('button', { name: '$ Dollars' }).click();
  await expect(page.getByLabel('Amount ($)')).toHaveValue('25');
  await page.getByLabel('Name on your bank account').fill('Ada Obi');
  await page.getByLabel('Email').fill('giver@example.com');
  await page.getByRole('button', { name: 'Show bank details' }).click();
  await expect(page.getByText('Transfer $25 to our dollar account below.')).toBeVisible();
  await expect(page.locator('.panel').getByText('1111111111')).toBeVisible();
  await expect(page.locator('.panel').getByText('SAMPNGLA')).toBeVisible();
});

test('organiser area needs the password', async ({ page }) => {
  await page.goto('/#/admin');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('That password is not right.');
  await expect(page.getByRole('button', { name: 'Contributions' })).toBeHidden();
});

test('organiser confirms a contribution and the total updates', async ({ page }) => {
  await page.goto('/#/support');
  await page.getByLabel('Amount (₦)').fill('1234');
  await page.getByLabel('Name on your bank account').fill('Confirm Me');
  await page.getByLabel('Email').fill(uniqueEmail());
  await page.getByRole('button', { name: 'Show bank details' }).click();
  const reference = (await page.locator('.panel .copyval.code').last().textContent()) ?? '';
  await page.getByRole('button', { name: "I've sent it" }).click();
  await expect(page.getByText('Thank you')).toBeVisible();

  await signIn(page);
  await page.getByRole('button', { name: 'Contributions', exact: true }).click();
  // The exact confirmed naira total, from the line under the short figure ("₦245,000").
  const confirmedNaira = async (): Promise<number> => {
    const text = await page
      .locator('.nums > div')
      .filter({ hasText: 'Confirmed naira' })
      .locator('small')
      .textContent();
    return Number((text ?? '').replace(/[^\d.]/g, ''));
  };
  const before = await confirmedNaira();
  const row = page.getByRole('row').filter({ hasText: reference });
  await expect(row).toContainText('Check bank');
  await row.getByRole('button', { name: 'Confirm' }).click();
  await expect(row).toContainText('Confirmed');
  // Other tests share the backend and may confirm gifts too, so check it rose by at least ours.
  await expect.poll(confirmedNaira).toBeGreaterThanOrEqual(before + 1234);
});

test('organiser can edit the gathering and the public page reflects it', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  await page.getByLabel('Venue').fill('Landmark Centre, Lagos');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.goto('/#/home');
  await page.reload();
  await expect(page.locator('.date-txt')).toContainText('Landmark Centre, Lagos');
});

test('dark mode toggle switches the theme and is remembered', async ({ page }) => {
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.reload();
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
