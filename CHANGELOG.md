# Changelog — Mensvra Channel

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico, mas com uma ressalva honesta: **enquanto não houver cliente, a versão marca entrega, não compatibilidade** — não há API pública consumida por terceiro para quebrar.

O plano do produto exige este arquivo desde o começo (`docs/12-mensvra-channel.md` §11) e ele não existia. Começa aqui, e a partir daqui toda entrega fecha com uma entrada — sem entrada, a entrega não terminou.

Nada abaixo esteve em produção sob a marca nova: o deploy segue no código anterior, porque o banco hospedado ainda não recebeu as duas migrations do E1.

## [0.3.0] — 2026-08-17

### Marca

- **Instant passa a ser Mensvra** (*mensura*, latim para medida). O produto é **Mensvra Channel**; o ERP, **Mensvra ERP**. A decisão, o motivo e o que deliberadamente não mudou estão em `instant-empresa/adr/0011`.
- Logotipo e símbolo em `apps/web/src/componentes/Marca.tsx`, desenhados em curvas. Logotipo com `font-family` vira outro logotipo na máquina sem a fonte, e servido de um Worker não há como garantir a fonte carregada antes da primeira pintura.
- O ambiente local foi inteiro para a marca nova — container, banco, usuário e bucket. **A Cloudflare não**: bucket R2 e KV mantêm o nome antigo (bucket não se renomeia; o binding do R2 está comentado, então nada quebra).

### Corrigido

- **Booking pública criava agendamento com a agenda desligada.** A Server Action roda sem sessão e descobre o tenant pelo slug, então o `notFound()` da página não protegia nada: quem soubesse um slug fazia o POST direto. O portão passa a ser a action, antes de qualquer trabalho de banco. Mesma guarda nas actions autenticadas da agenda.
- **Sessão órfã virava tela de erro em vez de voltar ao login.** O layout do painel apagava o cookie dentro de um Server Component, o que o Next proíbe, e a exceção estourava antes do `redirect`. Quem apaga agora é a rota `/api/sair`.
- **A inbox exibia o horário errado.** Ao lado do texto da última mensagem aparecia o instante de `atualizadoEm`, que é `@updatedAt`: aplicar etiqueta ou assumir a conversa rejuvenescia a linha, e ela anunciava "há 2 min" sobre mensagem de ontem — na tela cujo trabalho é decidir quem responder primeiro.

### Testes

- **A suíte passava por vacuidade.** Todo e2e de `packages/db` abre com `describe.skipIf(!DATABASE_URL_TEST)`, e `pnpm test` não define a variável: a camada de banco inteira era pulada, incluindo o teste de vazamento entre tenants, e o resultado saía verde. Com o ambiente local no ar, a variável passa a ser preenchida sozinha — e só a partir de banco em `localhost`, porque estes testes criam e apagam tenants.
- `agendarBookingAction` ganha teste que prova que o banco **não é tocado** com a agenda desligada, mais o contrapositivo — sem ele, um `return` no topo da função passaria e a agenda nunca mais voltaria ao ar.

### Adicionado

- Seed com quatro conversas de demonstração. Sem elas a inbox abre vazia e nem quem desenvolve vê funcionando fila, prazo, dono, não lidas e encerramento. Os instantes são relativos ao momento do seed, para que "dentro do prazo" não apareça vermelho uma semana depois.

### Segurança

- `.gitignore` passa a cobrir `.dev.vars*` e `*.neon`. O padrão anterior casava só com o nome exato `.dev.vars`, e por isso `.dev.vars.neon` — que guarda a URL do Neon — não estava ignorado. O arquivo chegou a entrar num commit local e foi removido antes de qualquer push; a credencial não saiu da máquina.
