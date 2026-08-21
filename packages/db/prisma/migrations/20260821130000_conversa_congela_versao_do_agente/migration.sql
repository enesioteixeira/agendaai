-- "Publicar é congelar", agora com mecanismo.
--
-- O comentário do model AgenteIA já dizia que uma conversa em andamento termina
-- na versão em que começou, e o VersaoFluxo já fazia isso pela árvore. Para a
-- IA, porém, o contexto do turno resolvia a versão ATIVA a cada turno: publicar
-- uma persona nova trocava o interlocutor no meio da conversa.
--
-- FK lógica, no mesmo padrão de `fluxoVersaoId` e de `AgenteIA.versaoAtivaId` —
-- a referência física criaria ciclo entre Conversa, Canal, AgenteIA e Versao.
ALTER TABLE "Conversa" ADD COLUMN "agenteVersaoId" TEXT;
