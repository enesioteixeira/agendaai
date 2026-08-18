import { notFound, redirect } from "next/navigation";

import { situacaoDoPrazo, temEscopo } from "@atende/core";
import {
  listarEtiquetas,
  listarFilas,
  listarMotivosEncerramento,
  listarNotasDaConversa,
  listarRespostasRapidas,
  prisma,
  runWithTenant,
} from "@atende/db";
import { EstadoVazio } from "@atende/ui";

import { PulsoDaInbox } from "@/modules/inbox/PulsoDaInbox";
import { BarraDaConversa } from "@/modules/inbox/BarraDaConversa";
import { Composer } from "@/modules/inbox/Composer";
import { ListaDeConversas } from "@/modules/inbox/ListaDeConversas";
import { PainelDoContato } from "@/modules/inbox/PainelDoContato";
import { Timeline } from "@/modules/inbox/Timeline";
import { comFiltros, lerFiltros } from "@/modules/inbox/filtros";
import { lerSessao } from "@/lib/sessao";

// A inbox com uma conversa aberta: lista · timeline · contexto.
export default async function ConversaDaInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");

  const [{ id }, query] = await Promise.all([params, searchParams]);

  if (!temEscopo(sessao, "atendimento:responder")) {
    return (
      <div className="p-6">
        <EstadoVazio
          icone="escudo"
          titulo="Sem acesso à inbox"
          descricao="Seu papel não atende conversas. Peça a um administrador o escopo atendimento:responder."
        />
      </div>
    );
  }

  const contexto = { empresaId: sessao.empresaId, usuarioId: sessao.usuarioId };

  const dados = await runWithTenant(contexto, async () => {
    const conversa = await prisma.conversa.findUnique({
      where: { id },
      include: {
        canal: true,
        atendente: true,
        // `prazoPrimeiraRespostaMin` vem junto porque é ele que diz ao núcleo
        // quando acender o alerta (80% do prazo corrido). Sem o total,
        // `situacaoDoPrazo` cai na janela conservadora de 5 min e a conversa de
        // uma fila de 4 horas só ficaria âmbar nos últimos minutos.
        fila: { select: { id: true, nome: true, prazoPrimeiraRespostaMin: true } },
        etiquetas: { include: { etiqueta: true } },
        cliente: {
          include: {
            identidades: {
              where: { deletedAt: null },
              orderBy: { tipo: "asc" },
            },
          },
        },
        // 500 é o teto da janela que a tela desenha de uma vez; conversa mais
        // longa que isso pede paginação para trás, não uma página de 3 mil
        // bolhas que trava o navegador.
        mensagens: {
          orderBy: { criadoEm: "asc" },
          take: 500,
          include: { autor: { select: { nome: true } } },
        },
      },
    });

    // `notFound` e não 403 quando a conversa é de outro tenant: a extension de
    // tenancy já a torna invisível, e distinguir "não existe" de "não é sua"
    // confirmaria a existência de um id alheio.
    if (!conversa || conversa.deletedAt) return null;

    // Tudo o que a tela precisa depois de saber a conversa, de uma vez só. As
    // respostas rápidas dependem da FILA dela (`listarRespostasRapidas` devolve
    // as da fila mais as gerais), e é por isso que este bloco não pode entrar no
    // mesmo `Promise.all` da conversa.
    const [notas, motivos, catalogoDeEtiquetas, respostas, filas] = await Promise.all([
      listarNotasDaConversa(conversa.id),
      listarMotivosEncerramento(),
      listarEtiquetas(),
      listarRespostasRapidas(conversa.filaId),
      listarFilas(),
    ]);

    return { conversa, notas, motivos, catalogoDeEtiquetas, respostas, filas };
  });

  if (!dados) notFound();
  const { conversa, notas, motivos, catalogoDeEtiquetas, respostas, filas } = dados;
  const filtros = lerFiltros(query, filas);

  const encerrada = conversa.estado === "encerrada";
  const souOAtendente = conversa.atendenteUsuarioId === sessao.usuarioId;
  // Responder também assume a conversa (ver `responderConversaAction`), então o
  // composer aparece na fila; o que ele não faz é deixar escrever em conversa de
  // outro atendente ou já encerrada. NOTA INTERNA não passa por esta porta: o
  // composer sempre a oferece, porque nota nenhuma chega ao cliente e anotar o
  // que aconteceu depois do encerramento é quando ela mais vale.
  const podeResponder =
    !encerrada && (conversa.estado === "fila_humano" || souOAtendente);

  // A situação do prazo é do NÚCLEO, com o mesmo instante de referência que a
  // lista usa. Um `if` de "está atrasada?" nesta página seria uma segunda
  // verdade sobre o mesmo compromisso.
  const situacaoPrazo = situacaoDoPrazo(
    new Date(),
    conversa.prazoPrimeiraRespostaEm,
    conversa.primeiraRespostaEm,
    conversa.fila?.prazoPrimeiraRespostaMin,
  );

  return (
    // Uma coluna de cada vez conforme a largura permite:
    //   celular → só a conversa (com "voltar" na barra)
    //   ≥ lg    → lista + conversa
    //   ≥ xl    → lista + conversa + contexto
    // O contato é o primeiro a sair porque é apoio; a conversa é o trabalho.
    <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr] xl:grid-cols-[340px_1fr_300px]">
      <PulsoDaInbox />

      {/* A lista some no celular: quem abriu a conversa quer a conversa, e
          empilhar as duas faria rolar cem itens até chegar na primeira bolha. */}
      <div className="hidden min-h-0 lg:grid">
        <ListaDeConversas
          filtros={filtros}
          filas={filas}
          ativaId={conversa.id}
          empresaId={sessao.empresaId}
          usuarioId={sessao.usuarioId}
        />
      </div>

      <section aria-label="Conversa" className="flex min-h-0 flex-col bg-fundo">
        {/* Sem a lista ao lado, o caminho de volta precisa existir na tela — e
            precisa voltar para o MESMO recorte, senão o operador perde o filtro
            a cada conversa que abre. */}
        <a
          href={comFiltros("/inbox", filtros)}
          className="border-b border-borda bg-superficie px-4 py-2 text-[12px] text-acento lg:hidden"
        >
          ← Todas as conversas
        </a>

        <BarraDaConversa
          conversa={{
            id: conversa.id,
            estado: conversa.estado,
            cliente: conversa.cliente,
            canal: conversa.canal,
            atendente: conversa.atendente,
            fila: conversa.fila,
            situacaoPrazo,
            prazoPrimeiraRespostaEm: conversa.prazoPrimeiraRespostaEm,
          }}
          podeAssumir={temEscopo(sessao, "atendimento:assumir")}
          souOAtendente={souOAtendente}
          motivos={motivos}
          etiquetas={conversa.etiquetas.map((e) => ({
            id: e.etiqueta.id,
            nome: e.etiqueta.nome,
            cor: e.etiqueta.cor,
          }))}
          catalogoDeEtiquetas={catalogoDeEtiquetas}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 barra-fina">
          <Timeline mensagens={conversa.mensagens} notas={notas} />
        </div>

        <Composer
          conversaId={conversa.id}
          respostas={respostas}
          podeResponder={podeResponder}
          {...(podeResponder
            ? {}
            : {
                motivoDeNaoResponder: encerrada
                  ? "Conversa encerrada. Reabra para voltar a responder — a nota interna continua disponível."
                  : `Em atendimento com ${conversa.atendente?.nome ?? "outro atendente"}. Você ainda pode deixar uma nota interna.`,
              })}
        />
      </section>

      {/* O contexto do contato é apoio: sai primeiro quando falta largura. */}
      <div className="hidden min-h-0 xl:grid">
        <PainelDoContato contato={conversa.cliente} conversaIniciadaEm={conversa.criadoEm} />
      </div>
    </div>
  );
}
