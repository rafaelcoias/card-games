# Produção — Cards

## Estado atual

| Peça | Onde | Endereço |
|---|---|---|
| **Site** (`web`) | Railway, EU West | https://card-games-production-9d3d.up.railway.app |
| **Servidor de jogo** (`server`) | Railway, EU West | https://server-production-c483.up.railway.app (`/api/health`) |
| **Redis** (mesas em jogo) | Railway, EU West | rede privada (`redis.railway.internal`) |
| **Contas** | Firebase Auth, projeto `card-games-6c8e0` | e-mail + palavra-passe e link por e-mail |
| **Dados** | Firestore `(default)`, localização `nam5` | perfis, salas, partidas, histórico |

O projeto Railway é o `adorable-essence` (`d2e1fea4-c572-43f2-a1b8-6fcc64444f57`). Os deploys são
automáticos: cada push para a `main` reconstrói só os serviços cujos ficheiros mudaram (os *watch paths* estão
no ficheiro de infraestrutura).

Os três serviços estão em EU West (Amsterdão), perto dos jogadores. O Firestore está nos EUA, mas o servidor
só lhe acede ao ligar, ao começar e ao terminar partidas. As jogadas passam só pelo Redis.

## Infraestrutura como código (`.railway/railway.ts`)

Toda a configuração do Railway está em [`.railway/railway.ts`](.railway/railway.ts):
- serviços, Dockerfiles, região, health checks e política de reinício;
- variáveis de ambiente, exceto o segredo do Firebase.

O `railway.json` foi descontinuado pelo Railway e deixou de ser usado.

Para mudar a configuração, edita o ficheiro e depois corre:

```bash
npm i -g @railway/cli        # uma vez
railway login                # uma vez
railway link                 # uma vez, escolhe o projeto adorable-essence / production
railway config plan          # mostra o que vai mudar
railway config apply         # aplica (e faz redeploy do que for preciso)
```

> Corre estes comandos com o `railway` instalado globalmente e não via `npx`. O SDK verifica a versão da CLI
> pelo executável que o chamou e, via `npx`, falha com "requires Railway CLI 5.42.1 or newer".

### Variáveis

| Serviço | Variável | Valor | Origem |
|---|---|---|---|
| server | `NODE_ENV` | `production` | `railway.ts` |
| server | `REDIS_URL` | referência ao Redis | `railway.ts` |
| server | `WEB_ORIGIN` | URL do site | `railway.ts` |
| server | `FIREBASE_SERVICE_ACCOUNT` | chave do Firebase em base64 | **segredo**: só no Railway (ver abaixo) |
| web | `NEXT_PUBLIC_SITE_URL` | URL do site | `railway.ts` |
| web | `NEXT_PUBLIC_GAME_SERVER_URL` | URL do servidor | `railway.ts` |
| web | `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | configuração da app web "Cards Web" | `railway.ts` (públicos por natureza) |

Notas:
- As variáveis `NEXT_PUBLIC_*` entram no build do site. Mudá-las obriga a um novo build, que o
  `config apply` faz sozinho.
- **Não definas** `PORT` (o Railway define-a) nem as variáveis `*_EMULATOR_HOST`. O servidor recusa-se a
  arrancar com estas últimas em produção.

**Trocar a chave do Firebase.** Se rodares a chave (Firebase → Project settings → Service accounts → Generate
new private key):

```powershell
node -e "process.stdout.write(require('fs').readFileSync('NOVA-CHAVE.json').toString('base64'))" | railway variable set FIREBASE_SERVICE_ACCOUNT --stdin --service server
```

Depois apaga a chave antiga na Google Cloud Console (*IAM → Service accounts → Keys*).

## Firebase — o que está configurado

- **Authentication:**
  - Email/Password ativo, com link por e-mail (sem palavra-passe) também ativo.
  - *Authorized domains:* `localhost`, `card-games-production-9d3d.up.railway.app` e os domínios Firebase.
- **App web registada:** "Cards Web" (`1:174144427639:web:53560794a1314e6c9c5872`).
- **Firestore** fechado a browsers. Foi verificado: leitura e escrita anónimas com a configuração pública
  devolvem `403`. Só o servidor (Admin SDK) lê e escreve. Para versionar as regras explícitas de
  [`firestore.rules`](firestore.rules), publica-as com a tua conta, porque a chave do servidor não tem permissão
  para isso: `npx firebase login && npx firebase use card-games-6c8e0 && pnpm firebase:deploy-rules`.

### Opcional, recomendado

1. **Firebase → Authentication → Templates:** muda a língua para **Português**. Em cada modelo, *Customize
   action URL*: `https://card-games-production-9d3d.up.railway.app/auth/action`. A recuperação de
   palavra-passe e a confirmação de e-mail passam a abrir a página do Cards.
2. **Domínio próprio:**
   - Railway → serviço `web` → *Networking → Custom Domain*;
   - acrescenta o domínio a `domains` em `railway.ts`, a `WEB_URL`/`WEB_ORIGIN` e aos *Authorized domains*
     do Firebase.

## Verificar que está tudo bem

- `https://server-production-c483.up.railway.app/api/health` → `{"status":"ok"}`
- `https://server-production-c483.up.railway.app/api/presence/count` → quantos jogadores estão online
- Logs: `railway logs --service server` / `railway logs --service web`
- Teste automático contra produção (cria contas de teste reais; apaga-as no fim):

  ```bash
  cd apps/web
  E2E_BASE_URL=https://card-games-production-9d3d.up.railway.app npx playwright test e2e/multiplayer.spec.ts
  ```

## Estatísticas dos jogadores

As vitórias, derrotas e partidas de cada perfil são contadas quando uma partida acaba. Para perfis criados
antes disso existirem, recalcula-as a partir do histórico (usa a chave local de `apps/server/.env`; só mexe
em perfis sem estatísticas, a não ser com `--force`):

```bash
pnpm --filter @cardroom/server backfill:stats
```

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Fica em "A ligar…" e aparece erro de CORS na consola | `WEB_ORIGIN` não é o domínio do site | Corrige-o em `railway.ts` e corre `config apply` |
| "A mesa está fechada por momentos" | Servidor em baixo | `railway logs --service server` |
| `auth/unauthorized-continue-uri` ou `auth/unauthorized-domain` | Domínio não autorizado no Firebase | Authentication → Settings → Authorized domains |
| O servidor não arranca e mostra `Invalid environment` | Variável em falta ou inválida | Os logs dizem qual |

## Alternativa: site na Vercel

O site também corre na Vercel (Root Directory `apps/web`, que usa o [`apps/web/vercel.json`](apps/web/vercel.json)).
Para isso:
1. Define as mesmas variáveis `NEXT_PUBLIC_*`.
2. Acrescenta o domínio da Vercel a `WEB_ORIGIN` (separado por vírgulas) e aos *Authorized domains* do Firebase.
3. Retira o serviço `web` de `railway.ts`.
