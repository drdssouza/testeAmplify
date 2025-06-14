// app/hooks/useLLMConfig.ts
import { useState, useCallback, useEffect } from 'react';
import { 
  StepLLMSelections, 
  LLMSelection, 
  DEFAULT_LLM_SELECTIONS,
  validateLLMSelections,
  getModelInfo
} from '../types/llm-types';

interface UseLLMConfigOptions {
  persistToLocalStorage?: boolean;
  storageKey?: string;
  autoSave?: boolean;
}

interface LLMConfigState {
  llmSelections: StepLLMSelections;
  isValid: boolean;
  hasChanges: boolean;
}

export function useLLMConfig(options: UseLLMConfigOptions = {}) {
  const { 
    persistToLocalStorage = true, 
    storageKey = 'llm-dev-config',
    autoSave = true 
  } = options;

  // Estado principal - sempre inicializa com padrão para evitar hidratação
  const [state, setState] = useState<LLMConfigState>(() => ({
    llmSelections: DEFAULT_LLM_SELECTIONS,
    isValid: validateLLMSelections(DEFAULT_LLM_SELECTIONS),
    hasChanges: false
  }));

  // Carrega do localStorage APÓS hidratação
  useEffect(() => {
    if (!persistToLocalStorage) return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.extractHistory && parsed.generateCode && parsed.generateBDD) {
          setState({
            llmSelections: parsed,
            isValid: validateLLMSelections(parsed),
            hasChanges: false
          });
        }
      }
    } catch (error) {
      console.warn('Erro ao carregar configuração de LLM do localStorage:', error);
    }
  }, [persistToLocalStorage, storageKey]);

  // Função para salvar no localStorage
  const saveToStorage = useCallback((selections: StepLLMSelections) => {
    if (!persistToLocalStorage || typeof window === 'undefined') return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(selections));
    } catch (error) {
      console.warn('Erro ao salvar configuração de LLM no localStorage:', error);
    }
  }, [persistToLocalStorage, storageKey]);

  // Auto-save quando há mudanças
  useEffect(() => {
    if (autoSave && state.hasChanges) {
      saveToStorage(state.llmSelections);
      setState(prev => ({ ...prev, hasChanges: false }));
    }
  }, [state.hasChanges, state.llmSelections, autoSave, saveToStorage]);

  // Função para atualizar seleção específica
  const updateLLMSelection = useCallback((step: keyof StepLLMSelections, selection: LLMSelection) => {
    setState(prev => {
      const newSelections = {
        ...prev.llmSelections,
        [step]: selection
      };
      
      return {
        llmSelections: newSelections,
        isValid: validateLLMSelections(newSelections),
        hasChanges: true
      };
    });
  }, []);

  // Função para atualizar múltiplas seleções
  const updateMultipleLLMSelections = useCallback((updates: Partial<StepLLMSelections>) => {
    setState(prev => {
      const newSelections = {
        ...prev.llmSelections,
        ...updates
      };
      
      return {
        llmSelections: newSelections,
        isValid: validateLLMSelections(newSelections),
        hasChanges: true
      };
    });
  }, []);

  // Função para resetar para configurações padrão
  const resetToDefaults = useCallback(() => {
    setState({
      llmSelections: DEFAULT_LLM_SELECTIONS,
      isValid: true,
      hasChanges: true
    });
  }, []);

  // Função para salvar manualmente
  const saveConfig = useCallback(() => {
    saveToStorage(state.llmSelections);
    setState(prev => ({ ...prev, hasChanges: false }));
  }, [state.llmSelections, saveToStorage]);

  // Função para obter configuração formatada para API
  const getAPIPayload = useCallback(() => {
    return {
      extractHistoryModel: state.llmSelections.extractHistory,
      generateCodeModel: state.llmSelections.generateCode,
      generateBDDModel: state.llmSelections.generateBDD,
      isDev: true
    };
  }, [state.llmSelections]);

  // Função para obter informações detalhadas dos modelos selecionados
  const getSelectedModelsInfo = useCallback(() => {
    const { extractHistory, generateCode, generateBDD } = state.llmSelections;
    
    return {
      extractHistory: extractHistory ? getModelInfo(extractHistory.family, extractHistory.model) : null,
      generateCode: generateCode ? getModelInfo(generateCode.family, generateCode.model) : null,
      generateBDD: generateBDD ? getModelInfo(generateBDD.family, generateBDD.model) : null
    };
  }, [state.llmSelections]);

  // Função para duplicar configuração de um step para outro
  const duplicateStepConfig = useCallback((fromStep: keyof StepLLMSelections, toStep: keyof StepLLMSelections) => {
    const sourceConfig = state.llmSelections[fromStep];
    if (sourceConfig) {
      updateLLMSelection(toStep, sourceConfig);
    }
  }, [state.llmSelections, updateLLMSelection]);

  // Função para aplicar preset de configuração
  const applyPreset = useCallback((presetName: 'balanced' | 'performance' | 'cost-effective' | 'premium') => {
    const presets: Record<string, StepLLMSelections> = {
      'balanced': {
        extractHistory: { family: 'amazon-nova', model: 'pro' },
        generateCode: { family: 'anthropic-claude', model: 'sonnet-3.5' },
        generateBDD: { family: 'amazon-nova', model: 'little' }
      },
      'performance': {
        extractHistory: { family: 'anthropic-claude', model: 'sonnet-4' },
        generateCode: { family: 'anthropic-claude', model: 'sonnet-4' },
        generateBDD: { family: 'anthropic-claude', model: 'sonnet-3.5' }
      },
      'cost-effective': {
        extractHistory: { family: 'amazon-nova', model: 'little' },
        generateCode: { family: 'amazon-nova', model: 'pro' },
        generateBDD: { family: 'amazon-nova', model: 'micro' }
      },
      'premium': {
        extractHistory: { family: 'amazon-nova', model: 'premier' },
        generateCode: { family: 'anthropic-claude', model: 'sonnet-4' },
        generateBDD: { family: 'amazon-nova', model: 'premier' }
      }
    };

    const presetConfig = presets[presetName];
    if (presetConfig) {
      setState({
        llmSelections: presetConfig,
        isValid: true,
        hasChanges: true
      });
    }
  }, []);

  return {
    // Estado principal
    llmSelections: state.llmSelections,
    isValid: state.isValid,
    hasChanges: state.hasChanges,
    
    // Funções de atualização
    updateLLMSelection,
    updateMultipleLLMSelections,
    
    // Funções de controle
    resetToDefaults,
    saveConfig,
    duplicateStepConfig,
    applyPreset,
    
    // Funções de dados
    getAPIPayload,
    getSelectedModelsInfo
  };
}