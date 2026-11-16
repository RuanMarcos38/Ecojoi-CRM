export const standardStages = [
  ['new', 'Novo'],
  ['qualification', 'Qualificação'],
  ['proposal', 'Proposta'],
  ['closing', 'Fechamento'],
  ['won', 'Ganho'],
  ['lost', 'Perdido']
] as const;

export type PipelineDefinition = {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
};

export const standardPipeline: PipelineDefinition = {
  id: 'default',
  name: 'Funil padrão',
  stages: standardStages.map(([id, name]) => ({ id, name }))
};

export const stageKeyPattern = /^(new|qualification|proposal|closing|won|lost|custom_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
