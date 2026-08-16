import { describe, expect, it } from "vitest";

import { STATUS_WA, deveAtualizarAck, statusDoRecibo, type StatusEntrega } from "./acks";

describe("tradução do recibo", () => {
  it("mapeia os códigos que significam progresso", () => {
    expect(statusDoRecibo(STATUS_WA.SERVER_ACK)).toBe("enviada");
    expect(statusDoRecibo(STATUS_WA.DELIVERY_ACK)).toBe("entregue");
    expect(statusDoRecibo(STATUS_WA.READ)).toBe("lida");
    expect(statusDoRecibo(STATUS_WA.ERROR)).toBe("falhou");
  });

  it("trata áudio tocado como lido — a distinção não muda nada para quem atende", () => {
    expect(statusDoRecibo(STATUS_WA.PLAYED)).toBe("lida");
  });

  it("ignora PENDING, nulo e código desconhecido em vez de sobrescrever", () => {
    expect(statusDoRecibo(STATUS_WA.PENDING)).toBeNull();
    expect(statusDoRecibo(null)).toBeNull();
    expect(statusDoRecibo(undefined)).toBeNull();
    expect(statusDoRecibo(99)).toBeNull();
  });
});

describe("ordem dos recibos", () => {
  it("avança na escala", () => {
    expect(deveAtualizarAck("enviada", "entregue")).toBe(true);
    expect(deveAtualizarAck("entregue", "lida")).toBe(true);
    expect(deveAtualizarAck("pendente", "enviada")).toBe(true);
  });

  /**
   * O caso que motiva o módulo: o WhatsApp reentrega recibos fora de ordem, e
   * sem esta regra a mensagem já lida voltaria a ✓✓ cinza na frente do operador.
   */
  it("não retrocede quando o recibo chega fora de ordem", () => {
    expect(deveAtualizarAck("lida", "entregue")).toBe(false);
    expect(deveAtualizarAck("lida", "enviada")).toBe(false);
    expect(deveAtualizarAck("entregue", "enviada")).toBe(false);
  });

  it("não faz escrita à toa quando o status repete", () => {
    for (const s of ["pendente", "enviada", "entregue", "lida", "falhou"] as StatusEntrega[]) {
      expect(deveAtualizarAck(s, s), s).toBe(false);
    }
  });

  it("aceita falha depois de enviada — é o caso real do servidor que aceitou e não entregou", () => {
    expect(deveAtualizarAck("enviada", "falhou")).toBe(true);
    expect(deveAtualizarAck("entregue", "falhou")).toBe(true);
  });

  it("tira do estado de falha quando a entrega acaba acontecendo", () => {
    expect(deveAtualizarAck("falhou", "entregue")).toBe(true);
    expect(deveAtualizarAck("falhou", "enviada")).toBe(true);
    // ...mas não por um recibo que não é progresso de entrega
    expect(deveAtualizarAck("falhou", "pendente")).toBe(false);
  });
});
