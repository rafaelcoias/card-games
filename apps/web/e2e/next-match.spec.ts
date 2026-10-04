import { expect, type Page } from '@playwright/test';
import { createRoom, joinAndReady, signIn, takePeixinhoTurn, test, uniqueName } from './helpers';

const RESULTS = { name: 'Voltar à sala' } as const;
const HAND = { name: /^A tua mão/ } as const;

test('someone who comes in during a match waits in the room, ready, and plays the next one', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const [anaName, ruiName, biaName] = ['ana', 'rui', 'bia'].map(uniqueName) as [string, string, string];
  const ana = await signIn(browser, anaName);
  const rui = await signIn(browser, ruiName);
  const bia = await signIn(browser, biaName, { width: 390, height: 844 });
  const players: Page[] = [ana, rui];

  const code = await createRoom(ana, 'Peixinho');
  await joinAndReady(rui, code);
  await ana.getByRole('button', { name: 'Começar partida' }).click();
  for (const page of players) await expect(page.getByRole('group', HAND)).toBeVisible();

  // Bia comes in with the match under way: she waits in the room, not at the table.
  await bia.goto(`/room/${code}`);
  await expect(bia.getByText('Partida a decorrer')).toBeVisible();
  await expect(bia.getByText('2 a jogar')).toBeVisible();
  await expect(bia.getByRole('group', HAND)).toHaveCount(0);
  await bia.getByRole('button', { name: 'Estou pronto para a próxima' }).click();
  await expect(bia.getByText(/^Estás pronto: jogas a próxima/)).toBeVisible();
  // The table knows she is in for the next one.
  await expect(ana.getByTitle(`${biaName} espera pela próxima partida`)).toBeVisible();

  const deadline = Date.now() + 480_000;
  while (!(await ana.getByRole('button', RESULTS).isVisible())) {
    expect(Date.now(), 'match should finish in time').toBeLessThan(deadline);
    let acted = false;
    for (const page of players) acted = (await takePeixinhoTurn(page)) || acted;
    await ana.waitForTimeout(acted ? 250 : 120);
  }

  // Not her match, not her results: she stays in the room, which now shows how it ended.
  await expect(bia.getByText('Última partida')).toBeVisible();
  await expect(bia.getByRole('dialog')).toHaveCount(0);
  await expect(bia.getByRole('button', { name: 'Afinal, não estou pronto' })).toBeVisible();

  // The players find her already in for a rematch: once they are too, it starts with all three.
  const rematch = ana.getByRole('dialog').getByRole('listitem').filter({ hasText: biaName });
  await expect(rematch).toContainText('quer jogar outra vez');
  for (const page of players) await page.getByRole('button', { name: 'Jogar outra vez' }).click();
  for (const page of [ana, rui, bia]) await expect(page.getByRole('group', HAND)).toBeVisible();
  await expect(ana.getByTitle(`${biaName} espera pela próxima partida`)).toHaveCount(0);
});
