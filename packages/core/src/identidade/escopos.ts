// Catálogo GLOBAL de escopos (doc 02 §13) — vocabulário do produto, não do
// tenant. O seed insere estes na tabela Escopo; os papéis padrão compõem
// subconjuntos conforme a matriz. Formato: "modulo:acao".

export interface DefinicaoEscopo {
  chave: string;
  modulo: string;
  descricao: string;
}

export const ESCOPOS: DefinicaoEscopo[] = [
  { chave: "agenda:ler", modulo: "agenda", descricao: "Ver agendamentos" },
  { chave: "agenda:criar", modulo: "agenda", descricao: "Criar/remarcar agendamentos" },
  { chave: "agenda:cancelar", modulo: "agenda", descricao: "Cancelar agendamentos" },
  { chave: "agenda:configurar", modulo: "agenda", descricao: "Serviços, horários, bloqueios, recursos" },
  { chave: "clientes:ler", modulo: "clientes", descricao: "Ver clientes" },
  { chave: "clientes:criar", modulo: "clientes", descricao: "Cadastrar clientes" },
  { chave: "clientes:editar", modulo: "clientes", descricao: "Editar clientes" },
  { chave: "clientes:excluir", modulo: "clientes", descricao: "Excluir cliente (dispara fluxo LGPD)" },
  { chave: "atendimento:responder", modulo: "atendimento", descricao: "Responder conversas" },
  { chave: "atendimento:assumir", modulo: "atendimento", descricao: "Assumir conversa da fila" },
  { chave: "atendimento:configurar", modulo: "atendimento", descricao: "Fluxos, árvores, prompts" },
  { chave: "financeiro:cobrar", modulo: "financeiro", descricao: "Gerar cobranças" },
  { chave: "financeiro:relatorios", modulo: "financeiro", descricao: "Ver relatórios financeiros" },
  { chave: "financeiro:configurar", modulo: "financeiro", descricao: "Subconta Asaas, régua, split" },
  { chave: "contratos:criar", modulo: "contratos", descricao: "Gerar contratos" },
  { chave: "contratos:enviar", modulo: "contratos", descricao: "Enviar contrato ao cliente" },
  { chave: "contratos:cancelar", modulo: "contratos", descricao: "Cancelar contrato" },
  { chave: "fiscal:emitir", modulo: "fiscal", descricao: "Emitir NFS-e" },
  { chave: "loja:gerenciar", modulo: "loja", descricao: "Catálogo, estoque, pedidos" },
  { chave: "config:usuarios", modulo: "config", descricao: "Convites, papéis, vínculos" },
  { chave: "config:canais", modulo: "config", descricao: "Conectar WhatsApp, pareamento" },
  { chave: "config:empresa", modulo: "config", descricao: "Dados, unidades, plano, white-label" },
  { chave: "api:gerenciar", modulo: "api", descricao: "API keys (Pro+)" },
  { chave: "lgpd:operar", modulo: "lgpd", descricao: "Solicitações, export, anonimização" },
];

export const CHAVES_ESCOPO = ESCOPOS.map((e) => e.chave);
