-- Estado intermediário do envio + carimbo da reserva.
--
-- O claim do outbox marcava `enviada` ANTES de o conector enviar. Se o worker
-- morresse entre uma coisa e outra, a mensagem ficava `enviada` sem ter saído:
-- perda silenciosa, com ✓ na tela do atendente. Sem um estado intermediário no
-- enum não havia como distinguir "reservada" de "saiu".
--
-- `BEFORE 'enviada'` mantém a ordem física do tipo igual à do schema.
ALTER TYPE "StatusEntrega" ADD VALUE 'enviando' BEFORE 'enviada';

ALTER TABLE "Mensagem" ADD COLUMN "envioReservadoEm" TIMESTAMP(3);
