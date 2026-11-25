/**
 * Templates do WhatsApp (precisam ser cadastrados e aprovados na Meta com estes nomes e corpo).
 * Categoria "utility": mensagens ligadas ao serviço contratado (ritual, alertas, lembretes).
 * Ver docs/whatsapp-templates.md. Placeholders {{1}}, {{2}}... seguem a ordem de `params`.
 */
export interface TemplateDef {
  name: string;
  category: "utility" | "authentication";
  body: string;
  buttons?: string[];
  params: string[];
}

export const TEMPLATES = {
  ritual_semanal: {
    name: "ritual_semanal_v1",
    category: "utility",
    body: "Oi, {{1}}! Hora do ritual da semana {{2}} ({{3}} min). Primeira pergunta: você conseguiu fazer \"{{4}}\"?",
    buttons: ["Feito", "Em parte", "Não deu"],
    params: ["nome", "semana", "minutos", "acao"],
  },
  ritual_lembrete: {
    name: "ritual_lembrete_v1",
    category: "utility",
    body: "{{1}}, seu ritual da semana ainda está em aberto. Leva 5 minutos: {{2}}",
    params: ["nome", "link"],
  },
  alerta_desvio: {
    name: "alerta_desvio_v1",
    category: "utility",
    body: "Atenção, {{1}}: {{2}} Veja o painel: {{3}}",
    params: ["nome", "alerta", "link"],
  },
  tarefa_atribuida: {
    name: "tarefa_atribuida_v1",
    category: "utility",
    body: "Oi, {{1}}! {{2}} te passou uma tarefa: \"{{3}}\" até {{4}}. Responda FEITO quando concluir.",
    buttons: ["Feito"],
    params: ["nome", "quem", "tarefa", "prazo"],
  },
  codigo_acesso: {
    name: "codigo_acesso_v1",
    category: "authentication",
    body: "Seu código de acesso é {{1}}. Ele expira em 10 minutos. Não compartilhe.",
    params: ["codigo"],
  },
} as const satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATES;

export function renderTemplate(key: TemplateKey, values: string[]): string {
  const t = TEMPLATES[key];
  if (values.length !== t.params.length) throw new Error(`Template ${t.name} espera ${t.params.length} parâmetros`);
  return t.body.replace(/\{\{(\d+)\}\}/g, (_, i) => values[Number(i) - 1] ?? "");
}
