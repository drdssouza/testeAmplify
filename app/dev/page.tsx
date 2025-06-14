'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { 
  CloudArrowUpIcon, DocumentTextIcon, CodeBracketIcon, ClipboardDocumentIcon,
  PencilSquareIcon, ArrowDownTrayIcon, CheckCircleIcon, ExclamationTriangleIcon,
  EyeIcon, XMarkIcon, BeakerIcon, ArrowLeftIcon, CpuChipIcon, CogIcon,
  FolderIcon, TrashIcon
} from '@heroicons/react/24/outline';
import { LLMSelector } from '../components/LLMSelector';
import { useLLMConfig } from '../hooks/useLLMConfig';

type Step = 'upload' | 'code-review' | 'download';
type CodeLanguage = 'python' | 'java';

interface ContextFile {
  id: string;
  file: File;
  content: string;
}

export default function DevHome() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [userStory, setUserStory] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isContextDragOver, setIsContextDragOver] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<CodeLanguage | null>(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [editedCode, setEditedCode] = useState('');
  const [bddTest, setBddTest] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pollingStatus, setPollingStatus] = useState('');
  const [error, setError] = useState('');
  const [showCodeReference, setShowCodeReference] = useState(false);
  const [showLLMConfig, setShowLLMConfig] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contextInputRef = useRef<HTMLInputElement | null>(null);

  // Hook para gerenciar configuração de LLM
  const {
    llmSelections,
    isValid: isLLMConfigValid,
    hasChanges: hasLLMChanges,
    updateLLMSelection,
    getAPIPayload,
    getSelectedModelsInfo,
    applyPreset,
    resetToDefaults
  } = useLLMConfig();

  const steps = [
    { key: 'upload', label: 'História', icon: DocumentTextIcon },
    { key: 'code-review', label: 'Revisão', icon: CodeBracketIcon },
    { key: 'download', label: 'Download', icon: ArrowDownTrayIcon },
  ];

  const selectedModelsInfo = getSelectedModelsInfo();

  // Função para processar arquivo da história
  const processFile = (file: File) => {
    const allowedTypes = ['.txt', '.doc', '.docx'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(fileExtension)) {
      setError('Formato não suportado. Use .txt, .doc ou .docx');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Arquivo muito grande (máx: 5MB)');
      return;
    }

    setUploadedFile(file);
    setError('');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = (e.target?.result as string || '').trim();
      if (content.length > 100000) {
        setError('Conteúdo muito extenso (máx: 100k caracteres)');
        return;
      }
      setFileContent(content);
    };
    reader.onerror = () => setError('Erro ao ler arquivo');
    reader.readAsText(file);
  };

  // Função para processar arquivos de contexto
  const processContextFiles = (files: FileList) => {
    const allowedTypes = ['.txt', '.doc', '.docx', '.py', '.java', '.js', '.ts', '.json', '.md'];
    const newContextFiles: ContextFile[] = [];

    Array.from(files).forEach((file) => {
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!allowedTypes.includes(fileExtension)) {
        setError(`Arquivo ${file.name}: formato não suportado`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`Arquivo ${file.name}: muito grande (máx: 5MB)`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = (e.target?.result as string || '').trim();
        if (content.length > 100000) {
          setError(`Arquivo ${file.name}: conteúdo muito extenso (máx: 100k caracteres)`);
          return;
        }
        
        const contextFile: ContextFile = {
          id: crypto.randomUUID(),
          file,
          content
        };
        
        setContextFiles(prev => [...prev, contextFile]);
      };
      reader.onerror = () => setError(`Erro ao ler arquivo ${file.name}`);
      reader.readAsText(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleContextUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processContextFiles(files);
    }
  };

  const handleDrag = (e: React.DragEvent, type: 'over' | 'leave' | 'drop', isContext = false) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isContext) {
      if (type === 'over') setIsContextDragOver(true);
      else if (type === 'leave') setIsContextDragOver(false);
      else if (type === 'drop') {
        setIsContextDragOver(false);
        const files = e.dataTransfer.files;
        if (files.length > 0) processContextFiles(files);
      }
    } else {
      if (type === 'over') setIsDragOver(true);
      else if (type === 'leave') setIsDragOver(false);
      else if (type === 'drop') {
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
      }
    }
  };

  const removeContextFile = (id: string) => {
    setContextFiles(prev => prev.filter(f => f.id !== id));
  };

  const toggleLanguageSelection = (language: CodeLanguage) => {
    if (selectedLanguage === language) {
      setSelectedLanguage(null);
    } else {
      setSelectedLanguage(language);
    }
  };

  const generateCode = async () => {
    const content = uploadedFile ? fileContent : userStory.trim();
    if (!content) {
      setError('Insira uma história de usuário ou faça upload de arquivo');
      return;
    }

    if (!selectedLanguage) {
      setError('Selecione uma linguagem de programação');
      return;
    }

    if (!isLLMConfigValid) {
      setError('Configure todos os modelos LLM antes de continuar');
      return;
    }

    setIsLoading(true);
    setError('');
    setPollingStatus('Iniciando geração de código...');
    
    try {
      // Preparar payload com história e arquivos de contexto
      const payload = {
        userStory: content,
        language: selectedLanguage,
        contextFiles: contextFiles.map(cf => ({
          name: cf.file.name,
          content: cf.content
        })),
        llmConfig: getAPIPayload(),
        requestId: crypto.randomUUID()
      };

      const response = await fetch('/api/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Erro ao iniciar geração de código');
      const data = await response.json();
      
      const presignedUrl = data.presignedUrl;
      if (!presignedUrl) {
        throw new Error('URL de monitoramento não foi fornecida');
      }

      setPollingStatus('Aguardando processamento...');

      // Polling do resultado
      const result = await pollS3File(presignedUrl);
      const parsedResult = JSON.parse(result);
      
      setGeneratedCode(parsedResult.code || '');
      setEditedCode(parsedResult.code || '');
      setBddTest(parsedResult.bddTest || '');
      setCurrentStep('code-review');
      
    } catch (error) {
      setError(`Erro ao gerar código: ${error}`);
    } finally {
      setIsLoading(false);
      setPollingStatus('');
    }
  };

  // Função para fazer polling no S3
  const pollS3File = async (presignedUrl: string, maxAttempts = 30, interval = 2000): Promise<string> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        setPollingStatus(`Verificando arquivo... (${attempt}/${maxAttempts})`);
        
        const response = await fetch(presignedUrl, { method: 'HEAD' });
        
        if (response.ok) {
          const contentResponse = await fetch(presignedUrl);
          if (contentResponse.ok) {
            const content = await contentResponse.text();
            setPollingStatus('');
            return content;
          }
        }
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      } catch (error) {
        console.error(`Tentativa ${attempt} falhou:`, error);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }
    }
    
    throw new Error('Timeout: Arquivo não foi gerado no tempo esperado');
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (error) {
      console.error('Erro ao copiar:', error);
    }
  };

  const downloadZipFiles = () => {
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '');
    const ext = selectedLanguage === 'python' ? 'py' : 'java';
    const fileName = selectedLanguage === 'python' ? 'generated_code' : 'GeneratedCode';
    
    // Download código
    const codeBlob = new Blob([editedCode], { type: 'text/plain' });
    const codeUrl = URL.createObjectURL(codeBlob);
    const codeLink = document.createElement('a');
    codeLink.href = codeUrl;
    codeLink.download = `${fileName}_${timestamp}.${ext}`;
    codeLink.click();
    URL.revokeObjectURL(codeUrl);

    // Download BDD
    const bddBlob = new Blob([bddTest], { type: 'text/plain' });
    const bddUrl = URL.createObjectURL(bddBlob);
    const bddLink = document.createElement('a');
    bddLink.href = bddUrl;
    bddLink.download = `test_${timestamp}.feature`;
    bddLink.click();
    URL.revokeObjectURL(bddUrl);
  };

  const resetFlow = () => {
    setCurrentStep('upload');
    setUserStory('');
    setUploadedFile(null);
    setFileContent('');
    setContextFiles([]);
    setShowFilePreview(false);
    setIsDragOver(false);
    setIsContextDragOver(false);
    setSelectedLanguage(null);
    setGeneratedCode('');
    setEditedCode('');
    setBddTest('');
    setPollingStatus('');
    setError('');
    setShowCodeReference(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2 text-blue-600 hover:text-blue-700">
              <ArrowLeftIcon className="h-5 w-5" />
              <span>Voltar</span>
            </Link>
            <div className="flex items-center space-x-3">
              <BeakerIcon className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Dev Environment</h1>
                <p className="text-gray-600">Teste e configure modelos LLM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Configuração de LLM */}
        <div className="bg-white rounded-xl shadow-lg border mb-8">
          <div 
            className="p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded-t-xl"
            onClick={() => setShowLLMConfig(!showLLMConfig)}
          >
            <div className="flex items-center space-x-4">
              <CpuChipIcon className="h-6 w-6 text-blue-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Configuração de Modelos LLM</h3>
                <p className="text-sm text-gray-500">
                  Escolha os modelos específicos para cada etapa do processo
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {hasLLMChanges && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  Não salvo
                </span>
              )}
              <button className="text-blue-600 text-sm font-medium hover:text-blue-700">
                {showLLMConfig ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          {showLLMConfig && (
            <div className="border-t p-6 bg-gray-50">
              {/* Preset buttons */}
              <div className="mb-6">
                <label className="text-sm font-medium text-gray-700 mb-3 block">Presets rápidos:</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => applyPreset('balanced')}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200"
                  >
                    Balanceado
                  </button>
                  <button
                    onClick={() => applyPreset('performance')}
                    className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200"
                  >
                    Performance
                  </button>
                  <button
                    onClick={() => applyPreset('cost-effective')}
                    className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-full hover:bg-green-200"
                  >
                    Econômico
                  </button>
                  <button
                    onClick={() => applyPreset('premium')}
                    className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded-full hover:bg-orange-200"
                  >
                    Premium
                  </button>
                  <button
                    onClick={resetToDefaults}
                    className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200"
                  >
                    Padrão
                  </button>
                </div>
              </div>

              {/* Seletores de LLM */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <LLMSelector
                  title="1. Processar História"
                  description="Modelo para extrair e formatar a história de usuário"
                  selectedLLM={llmSelections.extractHistory}
                  onLLMChange={(selection) => updateLLMSelection('extractHistory', selection)}
                />
                
                <LLMSelector
                  title="2. Gerar Código"
                  description="Modelo para gerar código Python/Java"
                  selectedLLM={llmSelections.generateCode}
                  onLLMChange={(selection) => updateLLMSelection('generateCode', selection)}
                />
                
                <LLMSelector
                  title="3. Gerar Testes BDD"
                  description="Modelo para criar testes comportamentais"
                  selectedLLM={llmSelections.generateBDD}
                  onLLMChange={(selection) => updateLLMSelection('generateBDD', selection)}
                />
              </div>

              {/* Resumo das seleções */}
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                  <CogIcon className="h-4 w-4 mr-2" />
                  Configuração Atual:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="text-blue-800">
                    <strong>História:</strong><br />
                    {selectedModelsInfo.extractHistory?.familyName} - {selectedModelsInfo.extractHistory?.modelName}
                    <span className="ml-2 text-blue-600">({selectedModelsInfo.extractHistory?.costLevel})</span>
                  </div>
                  <div className="text-blue-800">
                    <strong>Código:</strong><br />
                    {selectedModelsInfo.generateCode?.familyName} - {selectedModelsInfo.generateCode?.modelName}
                    <span className="ml-2 text-blue-600">({selectedModelsInfo.generateCode?.costLevel})</span>
                  </div>
                  <div className="text-blue-800">
                    <strong>BDD:</strong><br />
                    {selectedModelsInfo.generateBDD?.familyName} - {selectedModelsInfo.generateBDD?.modelName}
                    <span className="ml-2 text-blue-600">({selectedModelsInfo.generateBDD?.costLevel})</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Progress Steps */}
        <div className="flex justify-center mb-12">
          {steps.map((step, index) => {
            const isActive = currentStep === step.key;
            const isCompleted = steps.findIndex(s => s.key === currentStep) > index;
            const Icon = step.icon;

            return (
              <div key={step.key} className="flex items-center">
                {index > 0 && (
                  <div className={`w-16 h-0.5 ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} />
                )}
                <div className="flex flex-col items-center min-w-24">
                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                    isCompleted ? 'bg-green-500 border-green-500' :
                    isActive ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'
                  }`}>
                    <Icon className={`h-6 w-6 ${isCompleted || isActive ? 'text-white' : 'text-gray-400'}`} />
                  </div>
                  <span className={`mt-2 text-sm font-medium ${
                    isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400 mr-2" />
              <span className="text-red-700">{error}</span>
            </div>
          </div>
        )}

        {/* Upload Step */}
        {currentStep === 'upload' && (
          <div className="space-y-8">
            {/* História de Usuário */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">História de Usuário</h2>
              
              <div className="space-y-6">
                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload de arquivo ou digite diretamente (obrigatório)
                  </label>
                  
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer ${
                      isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => handleDrag(e, 'over')}
                    onDragLeave={(e) => handleDrag(e, 'leave')}
                    onDrop={(e) => handleDrag(e, 'drop')}
                  >
                    <div className="text-center">
                      <CloudArrowUpIcon className={`mx-auto h-12 w-12 ${isDragOver ? 'text-blue-500' : 'text-gray-400'}`} />
                      <div className="mt-4">
                        <p className="text-lg font-medium text-gray-700">
                          Arraste seu arquivo aqui ou clique para selecionar
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Formatos: .txt, .doc, .docx (máx: 5MB)
                        </p>
                      </div>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    accept=".txt,.doc,.docx"
                    className="hidden"
                  />

                  {uploadedFile && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <DocumentTextIcon className="h-5 w-5 text-green-600 mr-2" />
                          <span className="text-sm font-medium text-green-700">{uploadedFile.name}</span>
                        </div>
                        <button
                          onClick={() => setShowFilePreview(!showFilePreview)}
                          className="text-green-600 hover:text-green-700"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                      </div>
                      {showFilePreview && (
                        <div className="mt-3 p-3 bg-white border rounded text-sm max-h-40 overflow-y-auto">
                          <pre className="whitespace-pre-wrap">{fileContent}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Manual Input */}
                <div className="border-t pt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ou digite sua história de usuário:
                  </label>
                  <textarea
                    value={userStory}
                    onChange={(e) => setUserStory(e.target.value)}
                    placeholder="Digite sua história de usuário aqui..."
                    rows={6}
                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Arquivos de Contexto */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="flex items-center space-x-3 mb-6">
                <FolderIcon className="h-6 w-6 text-orange-600" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Arquivos de Contexto</h2>
                  <p className="text-sm text-gray-600">
                    Opcional: arquivos para dar contexto sobre padrões de código e estrutura do projeto
                  </p>
                </div>
              </div>
              
              <div className="space-y-6">
                {/* Context Files Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Múltiplos arquivos de contexto (opcional)
                  </label>
                  
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer ${
                      isContextDragOver ? 'border-orange-500 bg-orange-50' : 'border-gray-300 hover:border-orange-400'
                    }`}
                    onClick={() => contextInputRef.current?.click()}
                    onDragOver={(e) => handleDrag(e, 'over', true)}
                    onDragLeave={(e) => handleDrag(e, 'leave', true)}
                    onDrop={(e) => handleDrag(e, 'drop', true)}
                  >
                    <div className="text-center">
                      <FolderIcon className={`mx-auto h-12 w-12 ${isContextDragOver ? 'text-orange-500' : 'text-gray-400'}`} />
                      <div className="mt-4">
                        <p className="text-lg font-medium text-gray-700">
                          Arraste arquivos de contexto ou clique para selecionar
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          Formatos: .txt, .doc, .docx, .py, .java, .js, .ts, .json, .md (máx: 5MB cada)
                        </p>
                      </div>
                    </div>
                  </div>

                  <input
                    ref={contextInputRef}
                    type="file"
                    onChange={handleContextUpload}
                    accept=".txt,.doc,.docx,.py,.java,.js,.ts,.json,.md"
                    multiple
                    className="hidden"
                  />

                  {contextFiles.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">
                        Arquivos de contexto ({contextFiles.length}):
                      </h4>
                      {contextFiles.map((contextFile) => (
                        <div key={contextFile.id} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <DocumentTextIcon className="h-5 w-5 text-orange-600 mr-2" />
                              <span className="text-sm font-medium text-orange-700">{contextFile.file.name}</span>
                              <span className="text-xs text-orange-600 ml-2">
                                ({Math.round(contextFile.file.size / 1024)}KB)
                              </span>
                            </div>
                            <button
                              onClick={() => removeContextFile(contextFile.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Language Selection */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Selecione a Linguagem</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => toggleLanguageSelection('python')}
                  className={`p-6 border-2 rounded-lg transition-all ${
                    selectedLanguage === 'python'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2">🐍</div>
                    <div className="font-semibold">Python</div>
                  </div>
                </button>
                
                <button
                  onClick={() => toggleLanguageSelection('java')}
                  className={`p-6 border-2 rounded-lg transition-all ${
                    selectedLanguage === 'java'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-4xl mb-2">☕</div>
                    <div className="font-semibold">Java</div>
                  </div>
                </button>
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  onClick={generateCode}
                  disabled={isLoading || !isLLMConfigValid}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Processando...</span>
                    </>
                  ) : (
                    <>
                      <CodeBracketIcon className="h-5 w-5" />
                      <span>Gerar Código</span>
                    </>
                  )}
                </button>
              </div>

              {pollingStatus && (
                <div className="mt-4 text-center text-sm text-gray-600">
                  {pollingStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Code Review Step */}
        {currentStep === 'code-review' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Revisar e Editar Código</h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => copyToClipboard(editedCode)}
                  className="flex items-center space-x-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  <ClipboardDocumentIcon className="h-4 w-4" />
                  <span>Copiar</span>
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <textarea
                value={editedCode}
                onChange={(e) => setEditedCode(e.target.value)}
                className="w-full h-96 border border-gray-300 rounded-lg p-4 font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />

              <div className="flex justify-between">
                <button
                  onClick={resetFlow}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Voltar
                </button>
                
                <button
                  onClick={() => setCurrentStep('download')}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
                >
                  <CheckCircleIcon className="h-5 w-5" />
                  <span>Aprovar & Continuar</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Download Step */}
        {currentStep === 'download' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center">
              <CheckCircleIcon className="mx-auto h-16 w-16 text-green-500 mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Código Gerado com Sucesso!</h2>
              <p className="text-gray-600 mb-8">Seus arquivos estão prontos para download</p>
              
              <div className="space-y-4 mb-8">
                <button
                  onClick={downloadZipFiles}
                  className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 flex items-center space-x-2 mx-auto"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  <span>Download Arquivos</span>
                </button>
                
                <button
                  onClick={resetFlow}
                  className="block mx-auto px-6 py-2 text-gray-600 hover:text-gray-800"
                >
                  Gerar Novo Código
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}