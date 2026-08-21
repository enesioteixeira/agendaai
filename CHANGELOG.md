# Changelog — Mensvra Channel

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico, mas com uma ressalva honesta: **enquanto não houver cliente, a versão marca entrega, não compatibilidade** — não há API pública consumida por terceiro para quebrar.

O plano do produto exige este arquivo desde o começo (`docs/12-mensvra-channel.md` §11) e ele não existia. Começa aqui, e a partir daqui toda entrega fecha com uma entrada — sem entrada, a entrega não terminou.

Nada abaixo esteve em produção sob a marca nova: o deploy segue no código anterior, porque o banco hospedado ainda não recebeu as duas migrations do E1.

## [Não lançado]

Estágio E1. Nada aqui foi publicado: as migrations abaixo existem só no banco local, e a ordem para qualquer destino hospedado é migration → conferir → código.

### Corrigido

- **O outbox marcava a mensagem como enviada antes de enviá-la.** O claim gravava `enviada` e só então chamava o conector; morrer entre uma coisa e outra deixava a mensagem com ✓ na tela do atendente sem nada ter saído. Agora o claim reserva em **`enviando`** com carimbo, e só a confirmação do conector promove a `enviada` — na mesma escrita que grava o `idExterno`, o que também fechou a janela em que um recibo de entrega chegava antes de existir a quem pertencer. Reserva órfã vira **`falhou`** visível, e não `pendente`: o identificador externo só existe depois da entrega, então reenviar sozinho trocaria uma perda silenciosa por uma duplicação silenciosa. Migration `20260821120000_outbox_estado_enviando`.
- **Publicar uma versão de agente trocava a persona no meio da conversa.** O comentário do `AgenteIA` no schema já dizia "conversa em andamento termina na versão em que começou", e o `VersaoFluxo` já fazia isso pela árvore — mas o contexto do turno de IA resolvia a versão **ativa** a cada turno, então não havia congelamento nenhum. `Conversa.agenteVersaoId` passa a existir e a regra, com as três exceções que recongelam (versão sumiu, foi despublicada, ou é de outro agente), mora pura e testada em `packages/core/src/atendimento/ia/congelamento.ts`. Migration `20260821130000_conversa_congela_versao_do_agente`.

### Adicionado

- **Portão de lint, que não existia.** O `CLAUDE.md` e o doc 09 afirmavam que o import de `prismaSemTenant` era "lint-gated", e não havia ESLint no repositório: a regra em `packages/config/eslint/index.mjs` nunca rodou, e a única defesa automatizada da fronteira de tenancy era o teste de isolamento. Agora `pnpm lint` roda de verdade, com a allowlist expressa por caminho, e foi verificado que ele reprova um import fora dela. Quatro pacotes declaravam `"lint": "eslint ."` apontando para um binário ausente — os scripts mortos saíram. A escolha de uma configuração única na raiz, em vez de uma por workspace, está registrada como divergência 13 no doc 11.

## [0.3.0] — 2026-08-17

### Marca

- **Instant passa a ser Mensvra** (*mensura*, latim para medida). O produto é **Mensvra Channel**; o ERP, **Mensvra ERP**. A decisão, o motivo e o que deliberadamente não mudou estão em `instant-empresa/adr/0011`.
- Logotipo e símbolo em `apps/web/src/componentes/Marca.tsx`, desenhados em curvas. Logotipo com `font-family` vira outro logotipo na máquina sem a fonte, e servido de um Worker não há como garantir a fonte carregada antes da primeira pintura.
- O ambiente local foi inteiro para a marca nova — container, banco, usuário e bucket. **A Cloudflare não**: bucket R2 e KV mantêm o nome antigo (bucket não se renomeia; o binding do R2 está comentado, então nada quebra).

### Corrigido

- **Booking pública criava agendamento com a agenda desligada.** A Server Action roda sem sessão e descobre o tenant pelo slug, então o `notFound()` da página não protegia nada: quem soubesse um slug fazia o POST direto. O portão passa a ser a action, antes de qualquer trabalho de banco. Mesma guarda nas actions autenticadas da agenda.
- **Sessão órfã virava tela de erro em vez de voltar ao login.** O layout do painel apagava o cookie dentro de um Server Component, o que o Next proíbe, e a exceção estourava antes do `redirect`. Quem apaga agora é a rota `/api/sair`.
- **A inbox exibia o horário errado.** Ao lado do texto da última mensagem aparecia o instante de `atualizadoEm`, que é `@updatedAt`: aplicar etiqueta ou assumir a conversa rejuvenescia a linha, e ela anunciava "há 2 min" sobre mensagem de ontem — na tela cujo trabalho é decidir quem responder primeiro.

- **O pareamento por QR nunca funcionava, e não havia como saber.** O socket subia sem informar a versão do cliente WhatsApp, então o Baileys anunciava a constante embutida no pacote — que envelhece a cada release do WhatsApp. O servidor derrubava com **405 Connection Failure antes de emitir o QR**, e como 405 não é `loggedOut`, o gestor lia "queda passageira" e reconectava para sempre: log infinito de "caiu — reconectando", canal eternamente `desconectado`, e nenhuma mensagem apontando a causa. A versão agora é buscada do servidor e mantida em cache de 6 horas, com degradação para a última conhecida se a rede cair.
- **A tela de canais escondia a falha de decifragem do QR.** Quem cifra o QR é o worker e quem decifra é o painel; com `ENCRYPTION_KEY` diferente entre os dois — e `next dev` lê `.env.local`, não `.dev.vars` — a decifragem falhava dentro de um `catch` que devolvia nulo. O selo dizia "Escaneie o QR" sobre um vazio. Agora a tela separa três estados: QR pronto, QR ainda chegando, e QR ilegível com a instrução de qual arquivo conferir.

- **O canal nunca conseguia dizer "erro".** O estado existia no enum e na tela, mas nenhum código o gravava: falha persistente de socket aparecia como "Aguardando o worker", indistinguível de worker parado. Foi essa lacuna que manteve o 405 invisível. Agora, cinco quedas sem nunca emitir QR marcam o canal como erro, com a explicação na tela.
- **O QR não tinha idade.** Se o worker morresse logo depois de gravá-lo, a tela seguia exibindo um código vencido com cara de válido. `Canal.statusAtualizadoEm` (migration aditiva) permite avisar quando o QR passou de um minuto sem se renovar.

- **"Chave do provedor configurada" podia ser mentira.** A tela de agentes só conferia se o registro existia. Um segredo gravado com uma `ENCRYPTION_KEY` que depois mudou continua no banco, ilegível — e o agente respondia com a mensagem de transbordo sem ninguém entender por quê. Agora a tela tenta abrir o segredo (o valor não sai do servidor) e, quando não abre, diz isso e manda recadastrar.
- **O worker culpava o problema errado.** Falha ao decifrar a chave virava `sem-chave-do-provedor` — que manda o dono cadastrar uma chave que ele já cadastrou. Virou motivo próprio, `chave-do-provedor-ilegivel`, com a causa no log.
- **Os dois `docker-compose.yml` do ecossistema usavam o mesmo nome de projeto.** Ambos moram em `infra/`, e o Docker deriva o nome do diretório: subir a infra de um produto declarava os containers do outro como órfãos, e um `down` derrubaria a stack alheia. Cada compose agora tem `name:` próprio, e os volumes do Channel têm nome fixo para que a troca não os recriasse vazios — o que apagaria a sessão pareada do WhatsApp.

### Testes

- **A suíte passava por vacuidade.** Todo e2e de `packages/db` abre com `describe.skipIf(!DATABASE_URL_TEST)`, e `pnpm test` não define a variável: a camada de banco inteira era pulada, incluindo o teste de vazamento entre tenants, e o resultado saía verde. Com o ambiente local no ar, a variável passa a ser preenchida sozinha — e só a partir de banco em `localhost`, porque estes testes criam e apagam tenants.
- **Os testes ganham banco próprio.** Apontá-los para o banco de desenvolvimento resolvia o pulo silencioso e criava outro problema, observado na prática: cada rodada deixava dezenas de tenants e canais no banco do painel, e o worker passava a abrir um socket Baileys para cada canal de teste. Agora usam o irmão `<banco>_test`, criado e migrado sozinho na primeira rodada.
- `agendarBookingAction` ganha teste que prova que o banco **não é tocado** com a agenda desligada, mais o contrapositivo — sem ele, um `return` no topo da função passaria e a agenda nunca mais voltaria ao ar.

### Adicionado

- Seed com quatro conversas de demonstração. Sem elas a inbox abre vazia e nem quem desenvolve vê funcionando fila, prazo, dono, não lidas e encerramento. Os instantes são relativos ao momento do seed, para que "dentro do prazo" não apareça vermelho uma semana depois.

### Segurança

- `.gitignore` passa a cobrir `.dev.vars*` e `*.neon`. O padrão anterior casava só com o nome exato `.dev.vars`, e por isso `.dev.vars.neon` — que guarda a URL do Neon — não estava ignorado. O arquivo chegou a entrar num commit local e foi removido antes de qualquer push; a credencial não saiu da máquina.
