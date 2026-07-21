/**
 * Motor de acompanhamento (MÓDULO 8). Escolhe um estímulo conforme a situação
 * do cliente. Regra de ouro: nunca gerar culpa — todo caminho conta como presença.
 */

export type Situation =
  | "recorded_not_published"
  | "opened_not_produced"
  | "near_goal"
  | "goal_done"
  | "returned_after_pause"
  | "fresh_opportunity"
  | "radar_quiet";

export type StimulusSignals = {
  publishedThisWeek: number;
  weeklyGoal: number;
  hasOpportunityToday: boolean;
  recordedNotPublished: boolean; // gravou vídeo e não publicou
  openedNotProduced: boolean; // abriu conteúdo e não produziu
  daysSinceLastActivity: number | null;
};

const MESSAGES: Record<Situation, string> = {
  recorded_not_published:
    "Seu vídeo já está gravado. Falta só publicar — sua legenda já está pronta.",
  opened_not_produced:
    "Você já definiu o que vai falar. Que tal separar cinco minutos para gravar?",
  near_goal: "Você está a um passo da sua meta da semana. Bora fechar com chave de ouro?",
  goal_done: "Meta da semana concluída. Sua presença está crescendo — no seu ritmo.",
  returned_after_pause: "Bom te ver de volta. Comece leve: uma pauta, do seu jeito.",
  fresh_opportunity: "Seu roteiro está pronto e leva menos de dois minutos para ser lido.",
  radar_quiet: "Hoje o radar está calibrando. Assim que algo à sua altura aparecer, você é avisado.",
};

/** Deriva a situação e retorna a mensagem adequada. */
export function pickStimulus(s: StimulusSignals): { situation: Situation; message: string } {
  let situation: Situation;

  if (s.recordedNotPublished) situation = "recorded_not_published";
  else if (s.daysSinceLastActivity != null && s.daysSinceLastActivity >= 7)
    situation = "returned_after_pause";
  else if (s.publishedThisWeek >= s.weeklyGoal && s.weeklyGoal > 0) situation = "goal_done";
  else if (s.weeklyGoal > 0 && s.publishedThisWeek === s.weeklyGoal - 1) situation = "near_goal";
  else if (s.openedNotProduced) situation = "opened_not_produced";
  else if (s.hasOpportunityToday) situation = "fresh_opportunity";
  else situation = "radar_quiet";

  return { situation, message: MESSAGES[situation] };
}
