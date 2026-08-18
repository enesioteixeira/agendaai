-- Idade do estado de conexão do canal.
--
-- Aditiva e anulável de propósito: as linhas existentes ficam com NULL, e a
-- tela trata NULL como "idade desconhecida" em vez de fingir que é agora.
ALTER TABLE "Canal" ADD COLUMN "statusAtualizadoEm" TIMESTAMP(3);
