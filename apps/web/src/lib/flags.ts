// Sinalizadores de funcionalidade do painel.
//
// Por que variável de ambiente e não coluna por empresa: o desenho pede
// sinalizador POR TENANT, e ele vai ser isso quando existir um tenant que
// precise da diferença. Hoje não existe — não há cliente pagante em nenhum
// produto, e o perfil de cliente decidido é distribuidor com entrega, para
// quem a agenda não faz sentido nenhum. Criar a coluna agora custaria uma
// migration aplicada à mão contra o Neon (o build do Workers Builds não roda
// `migrate deploy`), com deploy coordenado, para diferenciar um conjunto de
// tenants que está vazio.
//
// Quando aparecer o primeiro tenant que precise da agenda ligada, isto vira
// `Empresa.agendaHabilitada` e esta função passa a ler a sessão. A troca é
// barata justamente porque o resto do código só conhece a função.

/**
 * A agenda é módulo congelado e saiu da superfície do produto.
 *
 * O código continua mantido em segurança, tenancy e LGPD — o que sai é o menu
 * e o acesso às rotas. Um distribuidor que abre o painel e vê "Profissionais",
 * "Salas & bloqueios" e "Horário de funcionamento" conclui, corretamente, que
 * o produto não é para ele.
 *
 * Ligar de novo: `AGENDA_HABILITADA=true` nas vars do Worker.
 */
export function agendaHabilitada(): boolean {
  return process.env.AGENDA_HABILITADA === "true";
}

/**
 * O cadastro é autoatendimento aberto?
 *
 * Hoje qualquer pessoa cria uma empresa e usa o produto de graça — não existe
 * plano, assinatura, limite nem porta de pagamento em lugar nenhum. Enquanto
 * isso for verdade, cadastro aberto é uma máquina ligada atraindo justamente o
 * público que o perfil de cliente decidido manda recusar: o formulário pede a
 * vertical, e as opções são salão, barbearia, clínica e advocacia.
 *
 * Fechado, a conta nasce por convite (`/convite/{token}`), que é o caminho que
 * já existe e que o comercial controla.
 *
 * Reabrir: `CADASTRO_ABERTO=true`. O gatilho para isso é a cobrança existir —
 * autoatendimento sem porta de pagamento não é aquisição, é custo.
 */
export function cadastroAberto(): boolean {
  return process.env.CADASTRO_ABERTO === "true";
}
