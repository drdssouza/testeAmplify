// app/components/LLMSelector.tsx
import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { LLMSelection, LLM_FAMILIES } from '../types/llm-types';

interface LLMSelectorProps {
  title: string;
  description?: string;
  selectedLLM: LLMSelection | null;
  onLLMChange: (selection: LLMSelection) => void;
  className?: string;
}

export const LLMSelector: React.FC<LLMSelectorProps> = ({
  title,
  description,
  selectedLLM,
  onLLMChange,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getSelectedModel = () => {
    if (!selectedLLM) return 'Selecionar Modelo';
    
    const family = LLM_FAMILIES.find(f => f.id === selectedLLM.family);
    const model = family?.models.find(m => m.id === selectedLLM.model);
    
    return model ? `${family.name} - ${model.name}` : 'Modelo Inválido';
  };

  const getCostBadgeColor = (costLevel: string) => {
    switch (costLevel) {
      case 'low':
        return 'bg-green-100 text-green-700';
      case 'medium':
        return 'bg-blue-100 text-blue-700';
      case 'high':
        return 'bg-orange-100 text-orange-700';
      case 'premium':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getCostLabel = (costLevel: string) => {
    switch (costLevel) {
      case 'low':
        return 'Econômico';
      case 'medium':
        return 'Médio';
      case 'high':
        return 'Alto';
      case 'premium':
        return 'Premium';
      default:
        return 'Médio';
    }
  };

  const handleModelSelect = (familyId: string, modelId: string) => {
    onLLMChange({ family: familyId, model: modelId });
    setIsExpanded(false);
  };

  const selectedModelInfo = selectedLLM ? (() => {
    const family = LLM_FAMILIES.find(f => f.id === selectedLLM.family);
    const model = family?.models.find(m => m.id === selectedLLM.model);
    return model;
  })() : null;

  return (
    <div className={`${className}`}>
      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700">
          {title}
        </label>
        {description && (
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        )}
      </div>

      <div className="relative">
        {/* Botão de seleção */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full px-3 py-3 text-left border rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors hover:bg-gray-50 ${
            selectedLLM ? 'border-blue-300' : 'border-gray-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CpuChipIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className={`text-sm block truncate ${selectedLLM ? 'text-gray-900' : 'text-gray-500'}`} suppressHydrationWarning>
                  {getSelectedModel()}
                </span>
                {selectedModelInfo && (
                  <div className="flex items-center space-x-2 mt-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCostBadgeColor(selectedModelInfo.costLevel)}`} suppressHydrationWarning>
                      {getCostLabel(selectedModelInfo.costLevel)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {isExpanded ? (
              <ChevronUpIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
            )}
          </div>
        </button>

        {/* Dropdown com opções */}
        {isExpanded && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            {LLM_FAMILIES.map((family) => (
              <div key={family.id} className="p-3 border-b border-gray-100 last:border-b-0">
                <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3 px-1">
                  {family.name}
                </div>
                <div className="space-y-1">
                  {family.models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => handleModelSelect(family.id, model.id)}
                      className={`w-full text-left px-3 py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors ${
                        selectedLLM?.family === family.id && selectedLLM?.model === model.id
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-gray-700 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{model.name}</div>
                          <div className="text-xs text-gray-500 truncate mt-1">{model.description}</div>
                        </div>
                        <div className="ml-3 flex-shrink-0">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCostBadgeColor(model.costLevel)}`}>
                            {getCostLabel(model.costLevel)}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Indicador de seleção */}
      {selectedLLM && (
        <div className="mt-2 text-xs text-green-600 flex items-center">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 flex-shrink-0"></div>
          <span className="truncate" suppressHydrationWarning>
            Modelo selecionado: {selectedModelInfo?.name}
          </span>
        </div>
      )}
    </div>
  );
};