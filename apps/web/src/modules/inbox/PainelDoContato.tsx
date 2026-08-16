import { Badge, formatarData, formatarTelefone } from "@atende/ui";

/**
 * A coluna 3: quem está do outro lado.
 *
 * Hoje mostra o cadastro e as identidades por canal. As identidades são o pivô
 * da memória unificada (doc 12 §1.1): o mesmo cliente falando por Instagram
 * hoje e por WhatsApp amanhã é uma pessoa só — e é aqui que o operador vê isso
 * e percebe quando duas fichas deveriam ser uma.
 *
 * Os cartões de ERP e CRM (pedidos, títulos em aberto, negócios) entram na
 * Fase G, quando houver o que consultar.
 */

const TIPO_DE_IDENTIDADE: Record<string, string> = {
  telefone: "Telefone",
  email: "E-mail",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  webchat: "Webchat",
};

export interface ContatoDaConversa {
  readonly nome: string;
  readonly telefone: string | null;
  readonly email: string | null;
  readonly provisorio: boolean;
  readonly identidades: readonly {
    readonly id: string;
    readonly tipo: string;
    readonly valor: string;
    readonly verificada: boolean;
  }[];
}

export function PainelDoContato({
  contato,
  conversaIniciadaEm,
}: {
  readonly contato: ContatoDaConversa;
  readonly conversaIniciadaEm: Date;
}) {
  return (
    <aside
      aria-label="Contexto do contato"
      className="flex min-h-0 flex-col gap-4 overflow-y-auto border-l border-borda bg-superficie p-4 barra-fina"
    >
      <section>
        <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
          Contato
        </h2>
        <p className="text-[13px] font-semibold">{contato.nome}</p>
        {contato.provisorio ? (
          // Cliente provisório nasce do próprio inbound: o nome costuma ser o
          // pushName do WhatsApp, não o nome real. Dizer isso evita que o
          // operador trate um apelido como cadastro conferido.
          <p className="mt-1 text-[11px] text-texto-fraco">
            Cadastro provisório, criado pela primeira mensagem — os dados ainda não foram
            confirmados.
          </p>
        ) : null}
        <dl className="mt-2 flex flex-col gap-1 text-[12px]">
          {contato.telefone ? (
            <div className="flex gap-2">
              <dt className="text-texto-fraco">Telefone</dt>
              <dd>{formatarTelefone(contato.telefone)}</dd>
            </div>
          ) : null}
          {contato.email ? (
            <div className="flex gap-2">
              <dt className="text-texto-fraco">E-mail</dt>
              <dd className="truncate">{contato.email}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="text-texto-fraco">Conversa desde</dt>
            <dd>{formatarData(conversaIniciadaEm)}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-fraco">
          Identidades
        </h2>
        {contato.identidades.length === 0 ? (
          <p className="text-[12px] text-texto-suave">Nenhuma identidade registrada.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {contato.identidades.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-[12px]">
                <span className="text-texto-fraco">{TIPO_DE_IDENTIDADE[i.tipo] ?? i.tipo}</span>
                <span className="min-w-0 flex-1 truncate">
                  {i.tipo === "telefone" ? formatarTelefone(i.valor) : i.valor}
                </span>
                {/* "Verificada" quer dizer posse comprovada (OTP) — não é
                    enfeite: é o que autoriza tratar duas identidades como a
                    mesma pessoa num merge. */}
                {i.verificada ? (
                  <Badge tom="sucesso" semPonto title="Posse comprovada">
                    ✓
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-auto border-t border-borda pt-3">
        <p className="text-[11px] leading-relaxed text-texto-fraco">
          Pedidos, títulos em aberto e negócios do CRM aparecem aqui quando essas integrações
          existirem (Fase G).
        </p>
      </section>
    </aside>
  );
}
