# Pôr o Cardroom online

Esta é a configuração recomendada, com o custo mais baixo:

| Peça | Onde | Porquê |
|---|---|---|
| **Contas** (login, registo, e-mails) | Firebase Auth | gerido pela Google |
| **Base de dados** (perfis, salas, partidas, histórico) | Firestore | gerido pela Google |
| **Site** (Next.js) | Vercel | é o sítio natural do Next.js, com CDN e plano grátis |
| **Servidor de jogo** (WebSockets) | Railway | precisa de um processo sempre ligado, o que a Vercel e o Firebase não oferecem |
| **Redis** (estado das mesas em jogo) | Railway | 1 clique, na mesma rede privada do servidor |

Demora cerca de 30 minutos. Segue os passos por ordem: cada passo usa valores do anterior.

---

## 0. Antes de começar

- Contas em [Firebase](https://console.firebase.google.com), [Railway](https://railway.com) e
  [Vercel](https://vercel.com). Podes entrar com o GitHub/Google em todas.
- O código num repositório GitHub, porque o Railway e a Vercel fazem deploy a partir daí:

  ```bash
  git init && git add -A && git commit -m "Cardroom"
  git branch -M main
  git remote add origin https://github.com/<utilizador>/cardroom.git
  git push -u origin main
  ```

- Guarda os valores abaixo à medida que os fores obtendo:

  ```
  FIREBASE_WEB_CONFIG   → apiKey, authDomain, projectId, appId   (passo 1.5)
  SERVICE_ACCOUNT_JSON  → ficheiro .json descarregado            (passo 1.6)
  SERVER_URL            → https://xxxx.up.railway.app            (passo 2.5)
  WEB_URL               → https://xxxx.vercel.app                (passo 3.3)
  ```

---

## 1. Firebase

1. **Criar o projeto.** Na [consola](https://console.firebase.google.com): *Add project*. O nome é livre, por
   exemplo `cardroom`, e o Google Analytics é opcional.
2. **Autenticação.** Em *Build → Authentication → Get started → Sign-in method*:
   - ativa **Email/Password**;
   - dentro do mesmo fornecedor, ativa também **Email link (passwordless sign-in)**.
3. **Firestore.** Em *Build → Firestore Database → Create database*:
   - escolhe **Production mode**;
   - escolhe a localização **`eur3 (europe-west)`**, ou outra europeia perto da região do Railway (passo 2.2).
     Esta escolha é definitiva.
4. **Regras de segurança.** Em *Firestore → Rules*, substitui o conteúdo pelo de [`firestore.rules`](firestore.rules)
   e carrega em *Publish*. As regras negam o acesso direto a partir de browsers: só o servidor lê e escreve.
   Em alternativa, publica-as pela linha de comandos:

   ```bash
   npx firebase login
   npx firebase use --add        # escolhe o teu projeto, com o alias "prod"
   pnpm firebase:deploy-rules
   ```

5. **Configuração da app web.** Em *Project settings* (engrenagem) *→ General → Your apps*:
   - carrega no ícone `</>` e regista a app (o nome é livre; não precisas do Hosting);
   - copia do bloco `firebaseConfig` os valores de **apiKey**, **authDomain**, **projectId** e **appId**. São
     públicos por natureza e vão para a Vercel.
6. **Chave do servidor.** Em *Project settings → Service accounts → Generate new private key*. Descarrega o
   ficheiro `.json`.
   > ⚠️ Este ficheiro dá acesso total ao projeto. Não o metas no Git e cola-o só no Railway.

> Os passos 1.7 e 1.8 fazem-se no fim, depois de teres o endereço da Vercel (ver secção 4).

---

## 2. Railway — servidor de jogo + Redis

1. **Criar o projeto.** Em *New Project → Deploy from GitHub repo*, escolhe o repositório. O Railway cria um
   serviço e tenta fazer deploy logo; se falhar, é normal, porque ainda falta configurá-lo.
2. **Configurar o serviço.** Clica no serviço e depois em *Settings*:
   - **Service name:** `server`;
   - **Root Directory:** deixa **vazio**, porque o Dockerfile precisa do monorepo inteiro;
   - **Config-as-code → Railway Config File:** `/apps/server/railway.json`. Este ficheiro define o Dockerfile,
     o health check e os *watch paths*;
   - **Region:** escolhe uma europeia (por exemplo *EU West*), perto do Firestore.
3. **Redis.** No canvas do projeto: *+ New → Database → Add Redis*.
4. **Variáveis.** No serviço `server`, em *Variables*, usa o *Raw Editor* e cola:

   ```env
   NODE_ENV=production
   REDIS_URL=${{Redis.REDIS_URL}}
   WEB_ORIGIN=https://placeholder.vercel.app
   FIREBASE_SERVICE_ACCOUNT=<cola aqui o conteúdo INTEIRO do .json do passo 1.6>
   ```

   - O JSON pode ficar em várias linhas. Se o editor der problemas, usa-o em base64: `base64 -w0 chave.json`
     no Linux/macOS, ou `[Convert]::ToBase64String([IO.File]::ReadAllBytes("chave.json"))` no PowerShell.
   - **Não** definas `PORT`: o Railway define-a sozinho.
   - **Não** definas as variáveis `*_EMULATOR_HOST`: o servidor recusa-se a arrancar com elas em produção.
   - `WEB_ORIGIN` é corrigida no passo 4.1.
5. **Domínio.** Em *Settings → Networking → Generate Domain*. Obténs algo como
   `https://server-production-xxxx.up.railway.app`: este é o **SERVER_URL**.
6. **Deploy.** Carrega em *Deploy* (ou faz push). Quando terminar, abre `SERVER_URL/api/health`: deve
   responder `{"status":"ok"}`. Se não responder, os *Deploy Logs* indicam a variável em falta, por exemplo
   `Invalid environment: …`.

---

## 3. Vercel — site

1. **Importar o repositório.** Em *Add New… → Project*, importa o repositório.
2. **Configurar:**
   - **Root Directory:** `apps/web`. O framework (Next.js) é detetado sozinho, e os comandos de instalação e
     build vêm de [`apps/web/vercel.json`](apps/web/vercel.json);
   - **Environment Variables:**

     | Nome | Valor |
     |---|---|
     | `NEXT_PUBLIC_SITE_URL` | `https://<o-teu-projeto>.vercel.app` (ajusta depois do 1.º deploy, se o nome mudar) |
     | `NEXT_PUBLIC_GAME_SERVER_URL` | o **SERVER_URL** do passo 2.5 |
     | `NEXT_PUBLIC_FIREBASE_API_KEY` | apiKey |
     | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | authDomain |
     | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | projectId |
     | `NEXT_PUBLIC_FIREBASE_APP_ID` | appId |

     Não definas `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST`: só serve em desenvolvimento.
3. **Deploy.** O endereço final (por exemplo `https://cardroom.vercel.app`) é o **WEB_URL**.
4. **Opcional mas recomendado.** Em *Settings → Functions → Function Region*, escolhe a região mais próxima
   do Railway (por exemplo *Frankfurt* ou *Paris*). Assim a primeira página carrega mais depressa.

> As variáveis `NEXT_PUBLIC_*` ficam embutidas no build. Depois de as mudares, faz *Redeploy*.

---

## 4. Ligar as peças

1. **Railway → `server` → Variables:** `WEB_ORIGIN=<WEB_URL>`. Se tiveres vários domínios, separa-os por
   vírgulas, por exemplo `https://cardroom.vercel.app,https://cartas.exemplo.pt`. O servidor reinicia sozinho.
   Esta variável controla o CORS: se estiver errada, o browser bloqueia a ligação ao servidor.
2. **Firebase → Authentication → Settings → Authorized domains:** *Add domain*, e acrescenta o domínio da
   Vercel sem `https://`, por exemplo `cardroom.vercel.app`. Faz o mesmo para cada domínio próprio. Sem isto,
   os links por e-mail falham com `auth/unauthorized-continue-uri`.
3. **(Opcional) E-mails com a tua página.** Em *Firebase → Authentication → Templates*:
   - em cada modelo, *Edit* (lápis) *→ Customize action URL*, e escreve `<WEB_URL>/auth/action`. A
     recuperação de palavra-passe e a confirmação de e-mail passam a abrir a página do Cardroom, e não a
     página genérica do Firebase;
   - muda também a língua dos modelos para **Português**.

---

## 5. Verificação final (5 minutos)

- [ ] `SERVER_URL/api/health` → `{"status":"ok"}`
- [ ] `WEB_URL` abre a página inicial e `WEB_URL/dev/cards` mostra o baralho
- [ ] Criar conta em `/register` → escolher nome → chegas às **Salas**, e o indicador no topo diz **Ligado**
- [ ] Numa janela anónima, criar uma 2.ª conta. Criar sala, entrar com o código, *Estou pronto*, *Começar
  partida*
- [ ] Jogar até ao fim. O resultado aparece no **Perfil** de ambos
- [ ] Na consola Firebase → Firestore, aparecem `profiles`, `rooms` e `matches` (com `actions`)
- [ ] *Esqueci-me da palavra-passe* envia mesmo o e-mail (confirma também a pasta de spam)

---

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Indicador "A ligar…" para sempre; erro de CORS na consola do browser | `WEB_ORIGIN` não corresponde ao domínio do site | Corrige-o no Railway (4.1), com `https://` e sem `/` no fim |
| Depois de entrar aparece "A mesa está fechada por momentos" | `NEXT_PUBLIC_GAME_SERVER_URL` errado, ou servidor em baixo | Confirma o 3.2 e o `/api/health`, e faz *Redeploy* na Vercel |
| O socket é rejeitado logo com "sessão expirou" | O `projectId` da Vercel não é o do *service account* | Usa o mesmo projeto Firebase nos dois lados |
| `auth/unauthorized-continue-uri` ou `auth/unauthorized-domain` | Domínio não autorizado | Passo 4.2 |
| `auth/operation-not-allowed` | Método de entrada desligado | Passo 1.2 |
| Deploy do servidor falha com `Invalid environment` | Variável em falta ou inválida | Os logs dizem qual; revê o passo 2.4 |
| Servidor não liga ao Redis (`ENOTFOUND redis.railway.internal`) | `REDIS_URL` escrita à mão | Usa a referência `${{Redis.REDIS_URL}}` |

---

## Custos e limites (aproximados — confirma nas páginas de preços)

- **Firebase (plano Spark, grátis).**
  - O Firestore grátis tem quotas diárias de leituras e escritas. Cada partida escreve uma entrada por jogada,
    em lotes (algumas centenas por partida), e isso chega bem para jogar com amigos. Com muito tráfego, passa
    para o plano **Blaze** (paga-se o que se usa).
  - O envio de e-mails do Auth (links e recuperação) tem limites diários no plano grátis.
- **Railway.** Plano Hobby com crédito mensal incluído. O servidor mais o Redis consomem pouco quando não há
  jogos.
- **Vercel.** O plano Hobby é grátis para uso pessoal e não comercial.

## Crescer

- **Mais capacidade.** Em `apps/server/railway.json`, sobe `numReplicas`, ou usa *Settings → Replicas*. O
  estado vive no Redis e os sockets sincronizam-se pelo adapter Redis, sem mais configuração.
- **Domínio próprio.**
  - Vercel: *Settings → Domains*.
  - Railway: *Networking → Custom Domain*, por exemplo `api.exemplo.pt`.
  - Depois atualiza `NEXT_PUBLIC_GAME_SERVER_URL`, `NEXT_PUBLIC_SITE_URL`, `WEB_ORIGIN` e os *Authorized
    domains* do Firebase.

## Alternativa: tudo no Railway (sem Vercel)

No mesmo projeto Railway: *+ New → GitHub repo* (o mesmo repositório), e cria um 2.º serviço `web`:

- Root Directory vazio.
- Railway Config File: `/apps/web/railway.json`. Usa o `apps/web/Dockerfile`, que produz o build *standalone*.
- Variáveis: as mesmas do passo 3.2. O Railway passa-as ao Docker como *build args*.
- Gera o domínio e usa-o como `WEB_URL` no passo 4.
