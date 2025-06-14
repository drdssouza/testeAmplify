// app/types/llm-types.ts

// Tipos para os modelos LLM
export type AmazonNovaModel = 'micro' | 'little' | 'pro' | 'premier';
export type AnthropicClaudeModel = 'haiku-3.5' | 'sonnet-3.5' | 'sonnet-3.5v2' | 'sonnet-3.7' | 'sonnet-4';

export interface LLMFamily {
  id: string;
  name: string;
  models: {
    id: string;
    name: string;
    description: string;
    costLevel: 'low' | 'medium' | 'high' | 'premium';
  }[];
}

export interface LLMSelection {
  family: string;
  model: string;
}

export interface StepLLMSelections {
  extractHistory: LLMSelection | null;
  generateCode: LLMSelection | null;
  generateBDD: LLMSelection | null;
}

// Configuração dos modelos disponíveis
export const LLM_FAMILIES: LLMFamily[] = [
  {
    id: 'amazon-nova',
    name: 'Amazon Nova',
    models: [
      { 
        id: 'micro', 
        name: 'Nova Micro', 
        description: 'Modelo ultrarrápido e econômico', 
        costLevel: 'low' 
      },
      { 
        id: 'little', 
        name: 'Nova Little', 
        description: 'Compacto e eficiente para tarefas simples', 
        costLevel: 'low' 
      },
      { 
        id: 'pro', 
        name: 'Nova Pro', 
        description: 'Modelo balanceado para tarefas complexas', 
        costLevel: 'medium' 
      },
      { 
        id: 'premier', 
        name: 'Nova Premier', 
        description: 'Máxima capacidade e precisão', 
        costLevel: 'premium' 
      }
    ]
  },
  {
    id: 'anthropic-claude',
    name: 'Anthropic Claude',
    models: [
      { 
        id: 'haiku-3.5', 
        name: 'Claude Haiku 3.5', 
        description: 'Rápido e econômico para tarefas básicas', 
        costLevel: 'low' 
      },
      { 
        id: 'sonnet-3.5', 
        name: 'Claude Sonnet 3.5', 
        description: 'Equilibrio entre velocidade e qualidade', 
        costLevel: 'medium' 
      },
      { 
        id: 'sonnet-3.5v2', 
        name: 'Claude Sonnet 3.5v2', 
        description: 'Versão melhorada com mais precisão', 
        costLevel: 'medium' 
      },
      { 
        id: 'sonnet-3.7', 
        name: 'Claude Sonnet 3.7', 
        description: 'Modelo avançado com alta precisão', 
        costLevel: 'high' 
      },
      { 
        id: 'sonnet-4', 
        name: 'Claude Sonnet 4', 
        description: 'Última geração - máxima inteligência', 
        costLevel: 'premium' 
      }
    ]
  }
];

export const DEFAULT_LLM_SELECTIONS: StepLLMSelections = {
  extractHistory: { family: 'amazon-nova', model: 'pro' },
  generateCode: { family: 'amazon-nova', model: 'pro' },
  generateBDD: { family: 'amazon-nova', model: 'pro' }
};

// Função para mapear modelos para identificadores AWS Bedrock
export function mapLLMToBedrockModel(family: string, model: string): string {
  const modelMap: Record<string, Record<string, string>> = {
    'amazon-nova': {
      'micro': 'amazon.nova-micro-v1:0',
      'little': 'amazon.nova-lite-v1:0', 
      'pro': 'amazon.nova-pro-v1:0',
      'premier': 'amazon.nova-premier-v1:0'
    },
    'anthropic-claude': {
      'haiku-3.5': 'anthropic.claude-3-5-haiku-20241022-v1:0',
      'sonnet-3.5': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'sonnet-3.5v2': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'sonnet-3.7': 'anthropic.claude-3-7-sonnet-20250106-v1:0',
      'sonnet-4': 'anthropic.claude-4-sonnet-20250105-v1:0'
    }
  };

  return modelMap[family]?.[model] || 'amazon.nova-pro-v1:0'; // fallback
}

// Função para obter informações do modelo
export function getModelInfo(family: string, model: string) {
  const familyObj = LLM_FAMILIES.find(f => f.id === family);
  const modelObj = familyObj?.models.find(m => m.id === model);
  
  return {
    familyName: familyObj?.name || 'Desconhecido',
    modelName: modelObj?.name || 'Desconhecido',
    description: modelObj?.description || '',
    costLevel: modelObj?.costLevel || 'medium',
    bedrockId: mapLLMToBedrockModel(family, model)
  };
}

// Função para validar seleções
export function validateLLMSelections(selections: StepLLMSelections): boolean {
  return !!(
    selections.extractHistory &&
    selections.generateCode &&
    selections.generateBDD
  );
}