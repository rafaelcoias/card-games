// Copies the generated card sprite from @cardroom/ui into /public so the browser can fetch and cache it.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../packages/ui/cards/sprite.svg');
const target = resolve(here, '../public/cards/sprite.svg');
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
