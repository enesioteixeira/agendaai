-- Unique PARCIAL: um convite PENDENTE por e-mail por tenant (doc 02 §2).
-- Prisma não expressa índice parcial — migration SQL manual (regra do repo).
-- Convites aceitos/expirados/revogados não bloqueiam reenvio: o reenvio
-- revoga o pendente anterior e cria um novo.
CREATE UNIQUE INDEX "ConviteUsuario_pendente_unico"
  ON "ConviteUsuario" ("empresaId", "email")
  WHERE "status" = 'pendente';
