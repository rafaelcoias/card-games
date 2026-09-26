import { expect, test, type Page } from '@playwright/test';
import { signIn, uniqueName } from './helpers';

const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-cardroom';

interface OobCode {
  email: string;
  requestType: string;
  oobCode: string;
  oobLink: string;
}

/** Latest e-mail action the Auth emulator "sent" to `email`. */
async function lastOob(email: string, type: string): Promise<OobCode> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await fetch(`http://${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const { oobCodes } = (await response.json()) as { oobCodes: OobCode[] };
    const match = oobCodes.filter((c) => c.email === email && c.requestType === type).at(-1);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No ${type} e-mail for ${email}`);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('heading', { name: /A mesa está posta/ })).toBeVisible();
}

test('sign out, protected routes and signing back in with a password', async ({ browser }) => {
  const name = uniqueName('ana');
  const page = await signIn(browser, name);
  await signOut(page);

  await page.goto('/lobby');
  await expect(page).toHaveURL(/\/login\?next=%2Flobby/);
  await page.getByLabel('E-mail').fill(`${name}@example.com`);
  await page.getByLabel('Palavra-passe').fill('errada123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('E-mail ou palavra-passe incorretos.')).toBeVisible();

  await page.getByLabel('Palavra-passe').fill('segredo123');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Salas', exact: true })).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();
});

test('passwordless sign-in with an e-mailed link', async ({ browser }) => {
  const name = uniqueName('rui');
  const page = await signIn(browser, name);
  await signOut(page);

  await page.goto('/login');
  await page.getByRole('tab', { name: 'Link por e-mail' }).click();
  await page.getByLabel('E-mail').fill(`${name}@example.com`);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText(/Enviámos um link/)).toBeVisible();

  const { oobLink } = await lastOob(`${name}@example.com`, 'EMAIL_SIGNIN');
  // The emulator link points at its own endpoint, which redirects to our continue URL.
  await page.goto(oobLink);
  await expect(page.getByRole('heading', { name: 'Salas', exact: true })).toBeVisible();
});

test('password reset through the branded action page', async ({ browser }) => {
  const name = uniqueName('eva');
  const page = await signIn(browser, name);
  await signOut(page);

  await page.goto('/forgot-password');
  await page.getByLabel('E-mail').fill(`${name}@example.com`);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText(/vais receber um e-mail/)).toBeVisible();

  const { oobCode } = await lastOob(`${name}@example.com`, 'PASSWORD_RESET');
  await page.goto(`/auth/action?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`);
  await page.getByLabel('Nova palavra-passe').fill('nova-senha-456');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Palavra-passe alterada')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('E-mail').fill(`${name}@example.com`);
  await page.getByLabel('Palavra-passe').fill('nova-senha-456');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Salas', exact: true })).toBeVisible();
});

test('an expired session cookie is renewed silently while Firebase is signed in', async ({ browser }) => {
  const page = await signIn(browser, uniqueName('ivo'));
  await page.context().clearCookies();
  await page.goto('/profile');
  // Proxy bounces to /login, which renews the cookie from the Firebase SDK and returns.
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible();
});
