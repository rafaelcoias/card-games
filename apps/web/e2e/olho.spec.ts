import { expect, type Locator, type Page } from '@playwright/test';
import { joinAndReady, signIn, test, uniqueName } from './helpers';

/**
 * A tap on an enabled control that may vanish at any moment (the table moves on by
 * itself): `false` instead of waiting for it forever.
 */
async function tap(target: Locator): Promise<boolean> {
  if (!(await target.isVisible().catch(() => false))) return false;
  if (!(await target.isEnabled({ timeout: 300 }).catch(() => false))) return false;
  return target
    .dispatchEvent('click', undefined, { timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
}

const handCards = (page: Page) => page.locator('[data-hand-card] [role="button"]');

/**
 * Whatever the table asks of this player: give back the lowest cards, escape
 * a skip, or play the lowest playable rank (tapping one card picks as many as
 * the trick needs) — and pass when nothing beats it. Clicks are dispatched
 * like taps: fanned cards cover each other.
 */
async function act(page: Page): Promise<boolean> {
  const escape = page.getByRole('alertdialog', { name: 'Escapar ao salto' });
  if (await tap(escape.getByRole('button', { name: /^Jogar / }))) return true;

  const giveBack = page.getByRole('button', { name: /^(Escolhe \d|Devolver \d)/ });
  if (await giveBack.isVisible().catch(() => false)) {
    const wanted = Number(/\d/.exec((await giveBack.textContent()) ?? '')?.[0] ?? 0);
    const picked = await page.locator('[data-hand-card] [role="button"][aria-pressed="true"]').count();
    for (let i = picked; i < wanted; i++) await handCards(page).nth(i).dispatchEvent('click');
    return tap(page.getByRole('button', { name: /^Devolver \d/ }));
  }

  const choose = page.getByRole('button', { name: 'Escolhe as cartas' });
  const play = page.getByRole('button', { name: /^(Jogar|Cortar|Bater|Abrir) / });
  const pass = page.getByRole('button', { name: 'Passar', exact: true });
  if (await choose.isVisible().catch(() => false)) {
    const playable = page.locator('[data-hand-card] [role="button"]:not([aria-disabled="true"])');
    if ((await playable.count()) > 0) await playable.first().dispatchEvent('click');
  }
  if (await tap(play)) return true;
  return tap(pass);
}

/** Plays every page until `done` holds. */
async function playUntil(pages: Page[], done: () => Promise<boolean>, label: string, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    expect(Date.now(), label).toBeLessThan(deadline);
    let acted = false;
    for (const page of pages) acted = (await act(page)) || acted;
    await pages[0]!.waitForTimeout(acted ? 200 : 150);
  }
}

const gameNumber = async (page: Page) =>
  Number(
    /Jogo (\d+)/.exec(
      (await page
        .getByText(/· Jogo \d+/)
        .first()
        .textContent()
        .catch(() => '')) ?? '',
    )?.[1] ?? 0,
  );

test('an Olho session through the UI: an exchange, a latecomer, a reload and a player leaving', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const names = ['ana', 'rui', 'eva', 'ze'].map(uniqueName);
  const host = await signIn(browser, names[0] as string);
  const rui = await signIn(browser, names[1] as string, { width: 390, height: 844 });
  const eva = await signIn(browser, names[2] as string, { width: 820, height: 1180 });
  const ze = await signIn(browser, names[3] as string, { width: 360, height: 740 });

  await host.getByRole('button', { name: 'Criar sala' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Olho', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Personalizar' }).click();
  await dialog.getByText('15s', { exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop() as string;
  for (const guest of [rui, eva]) await joinAndReady(guest, code);
  await host.getByRole('button', { name: 'Abrir a mesa' }).click();

  // All 54 cards dealt to three: 18 each.
  for (const page of [host, rui, eva])
    await expect(page.getByRole('group', { name: 'A tua mão: 18 cartas' })).toBeVisible();
  const players = [host, rui, eva];
  await playUntil(players, async () => (await gameNumber(host)) >= 2, 'the first game');

  // Game 2 opens with the exchange: the Presidente gives back two cards of their choice.
  await expect(host.getByRole('region', { name: 'Troca de cartas' })).toBeVisible();

  // A fourth player sits down at the running table and plays from the next game.
  await ze.goto(`/room/${code}`);
  await expect(
    ze.getByText('Sentaste-te a meio de um jogo: recebes cartas no próximo, sem cargo.'),
  ).toBeVisible();
  players.push(ze);

  // Mid-game, a player reloads: the table comes back as it was.
  await playUntil(players, async () => (await host.getByText(/Vaza [3-9]/).count()) > 0, 'a few tricks');
  await rui.reload();
  await expect(rui.getByRole('group', { name: /^A tua mão: \d+ cartas?/ })).toBeVisible();

  await playUntil(players, async () => (await gameNumber(host)) >= 3, 'the second game');
  await expect(ze.getByRole('group', { name: /^A tua mão: \d+ cartas?/ })).toBeVisible();

  // Someone leaves mid-game: the others play on.
  await eva.getByRole('button', { name: 'Sair da mesa' }).click();
  await eva.getByRole('dialog').getByRole('button', { name: 'Sair da mesa' }).click();
  await eva.waitForURL(/\/lobby$/);
  players.splice(players.indexOf(eva), 1);
  await playUntil(players, async () => (await gameNumber(host)) >= 4, 'the third game');

  // The host ends the session: the results rank everyone by points.
  await host.getByRole('button', { name: /^Terminar/ }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Terminar sessão' }).click();
  const results = host.getByRole('dialog', { name: /Ganhaste|Terminaste|Ficaste|Empate/ });
  await expect(results).toBeVisible();
  await expect(results.getByText(/^[+−]?\d+ pts$/)).toHaveCount(4);
  await expect(results.getByText(/Presidente \+2/)).toBeVisible();
  await host.getByRole('button', { name: 'Voltar à sala' }).click();
  await expect(host.getByText('Última partida')).toBeVisible();
});
