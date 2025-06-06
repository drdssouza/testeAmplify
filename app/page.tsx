'use client';

import { useState, useRef } from 'react';
import { 
  CloudArrowUpIcon, DocumentTextIcon, CodeBracketIcon, ClipboardDocumentIcon,
  PencilSquareIcon, ArrowDownTrayIcon, CheckCircleIcon, ExclamationTriangleIcon,
  EyeIcon, XMarkIcon
} from '@heroicons/react/24/outline';

type Step = 'upload' | 'code-review' | 'download';
type CodeLanguage = 'python' | 'java';

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [userStory, setUserStory] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<CodeLanguage | null>(null); // Mudança aqui: permite null
  const [generatedCode, setGeneratedCode] = useState('');
  const [editedCode, setEditedCode] = useState('');
  const [bddTest, setBddTest] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pollingStatus, setPollingStatus] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Função para fazer polling no S3
  const pollS3File = async (presignedUrl: string, maxAttempts = 30, interval = 2000): Promise<string> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        setPollingStatus(`Verificando arquivo... (${attempt}/${maxAttempts})`);
        
        const response = await fetch(presignedUrl, { method: 'HEAD' });
        
        if (response.ok) {
          // Arquivo existe, fazer download do conteúdo
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrag = (e: React.DragEvent, type: 'over' | 'leave' | 'drop') => {
    e.preventDefault();
    e.stopPropagation();
    
    if (type === 'over') setIsDragOver(true);
    else if (type === 'leave') setIsDragOver(false);
    else if (type === 'drop') {
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    }
  };

  // Função para alternar seleção de linguagem
  const toggleLanguageSelection = (language: CodeLanguage) => {
    if (selectedLanguage === language) {
      setSelectedLanguage(null); // Deseleciona se clicar na mesma
    } else {
      setSelectedLanguage(language); // Seleciona a nova linguagem
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

    if (!selectedLanguage) {
      setError('Selecione uma linguagem de programação');
      return;
    }

    setIsLoading(true);
    setError('');
    setPollingStatus('Iniciando geração de código...');
    
    try {
      // 1. Chamar API Gateway que aciona Step Function (com fallback imediato)
      const response = await fetch('/api/generate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userStory: content, 
          language: selectedLanguage,
          requestId: crypto.randomUUID()
        }),
      });

      if (!response.ok) throw new Error('Erro ao iniciar geração de código');
      const data = await response.json();
      
      // 2. API Gateway retorna presigned URL imediatamente
      const presignedUrl = data.presignedUrl;
      if (!presignedUrl) {
        throw new Error('URL de monitoramento não foi fornecida');
      }

      setPollingStatus('Aguardando processamento...');

      // 3. Fazer polling no S3 até o arquivo estar disponível
      const generatedContent = await pollS3File(presignedUrl);
      
      if (!generatedContent) {
        throw new Error('Código não foi gerado');
      }
      
      setGeneratedCode(generatedContent);
      setEditedCode(generatedContent);
      setCurrentStep('code-review');
      setPollingStatus('');
      
    } catch (error) {
      console.error('Erro na geração:', error);
      setError(error instanceof Error ? error.message : 'Erro ao gerar código. Tente novamente.');
      setPollingStatus('');
    } finally {
      setIsLoading(false);
    }
  };

  const generateBDD = async () => {
    if (!editedCode.trim()) {
      setError('Código é necessário para gerar testes BDD');
      return;
    }

    setIsLoading(true);
    setError('');
    setPollingStatus('Iniciando geração de testes BDD...');

    try {
      // 1. Chamar API Gateway que aciona Step Function (com fallback imediato)
      const response = await fetch('/api/generate-bdd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: editedCode, 
          language: selectedLanguage,
          requestId: crypto.randomUUID()
        }),
      });

      if (!response.ok) throw new Error('Erro ao iniciar geração de testes BDD');
      const data = await response.json();
      
      // 2. API Gateway retorna presigned URL imediatamente
      const presignedUrl = data.presignedUrl;
      if (!presignedUrl) {
        throw new Error('URL de monitoramento não foi fornecida');
      }

      setPollingStatus('Aguardando processamento...');

      // 3. Fazer polling no S3 até o arquivo estar disponível
      const bddContent = await pollS3File(presignedUrl);
      
      if (!bddContent) {
        throw new Error('Testes BDD não foram gerados');
      }
      
      setBddTest(bddContent);
      setCurrentStep('download');
      setPollingStatus('');
      
    } catch (error) {
      console.error('Erro na geração de BDD:', error);
      setError(error instanceof Error ? error.message : 'Erro ao gerar testes BDD. Tente novamente.');
      setPollingStatus('');
    } finally {
      setIsLoading(false);
    }
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

  const downloadFiles = () => {
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
    setShowFilePreview(false);
    setIsDragOver(false);
    setSelectedLanguage(null); // Reset para null
    setGeneratedCode('');
    setEditedCode('');
    setBddTest('');
    setPollingStatus('');
    setError('');
  };

  const steps = [
    { key: 'upload', label: 'História de Usuário', icon: DocumentTextIcon },
    { key: 'code-review', label: 'Código Gerado', icon: CodeBracketIcon },
    { key: 'download', label: 'Download', icon: ArrowDownTrayIcon }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <CodeBracketIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Gerador de Código IA</h1>
                <p className="text-sm text-gray-600">Powered by AWS Bedrock & Compass UOL</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 text-sm text-gray-500">
              <span>Desktop • Compass • AWS</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-center space-x-8">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.key;
            const isCompleted = steps.findIndex(s => s.key === currentStep) > index;
            
            return (
              <div key={step.key} className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
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
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">História de Usuário</h2>
            
            <div className="space-y-6">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload de arquivo ou digite diretamente
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
                      <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                        Selecionar Arquivo
                      </button>
                      <p className="mt-2 text-sm text-gray-500">ou arraste e solte aqui</p>
                      <p className="text-xs text-gray-400">Formatos: .txt, .doc, .docx</p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.doc,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {uploadedFile && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DocumentTextIcon className="h-5 w-5 text-blue-600" />
                        <span className="text-sm text-blue-700 font-medium">{uploadedFile.name}</span>
                        <span className="text-xs text-blue-500">({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setShowFilePreview(true)}
                          className="px-2 py-1 text-xs text-blue-600 bg-blue-100 rounded hover:bg-blue-200"
                        >
                          <EyeIcon className="h-3 w-3 inline mr-1" />Visualizar
                        </button>
                        <button
                          onClick={() => {
                            setUploadedFile(null);
                            setFileContent('');
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="text-xs text-blue-600 underline hover:text-blue-800"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">ou</span>
                </div>
              </div>

              {/* Text Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Digite sua história de usuário</label>
                <textarea
                  value={userStory}
                  onChange={(e) => {
                    setUserStory(e.target.value);
                    if (e.target.value && uploadedFile) {
                      setUploadedFile(null);
                      setFileContent('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }
                  }}
                  placeholder="Como um [tipo de usuário], eu quero [algum objetivo] para que eu possa [algum motivo]..."
                  className="w-full h-40 px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Language Selection - CORRIGIDO */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Escolha a linguagem <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div
                    onClick={() => toggleLanguageSelection('python')}
                    className={`cursor-pointer p-4 border-2 rounded-lg transition-all ${
                      selectedLanguage === 'python'
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        selectedLanguage === 'python' 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-300'
                      }`}>
                        {selectedLanguage === 'python' && (
                          <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">🐍 Python</div>
                        <div className="text-xs text-gray-500">Ideal para prototipagem e IA</div>
                      </div>
                    </div>
                  </div>

                  <div
                    onClick={() => toggleLanguageSelection('java')}
                    className={`cursor-pointer p-4 border-2 rounded-lg transition-all ${
                      selectedLanguage === 'java'
                        ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        selectedLanguage === 'java' 
                          ? 'border-orange-500 bg-orange-500' 
                          : 'border-gray-300'
                      }`}>
                        {selectedLanguage === 'java' && (
                          <div className="w-2 h-2 bg-white rounded-full m-0.5"></div>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">☕ Java</div>
                        <div className="text-xs text-gray-500">Ideal para aplicações enterprise</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {selectedLanguage && (
                  <div className="mt-2 text-sm text-green-600 flex items-center">
                    <CheckCircleIcon className="h-4 w-4 mr-1" />
                    {selectedLanguage === 'python' ? 'Python' : 'Java'} selecionado
                  </div>
                )}
              </div>

              <button
                onClick={generateCode}
                disabled={isLoading || (!userStory.trim() && !uploadedFile) || !selectedLanguage}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {pollingStatus || 'Gerando Código...'}
                  </div>
                ) : (
                  'Gerar Código'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Code Review Step */}
        {currentStep === 'code-review' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Código {selectedLanguage === 'python' ? 'Python' : 'Java'} Gerado
              </h2>
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                selectedLanguage === 'python' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
              }`}>
                {selectedLanguage === 'python' ? '🐍 Python' : '☕ Java'}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Código Gerado</h3>
                <button
                  onClick={() => copyToClipboard(editedCode)}
                  className="flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                >
                  <ClipboardDocumentIcon className="h-4 w-4 mr-1" />
                  Copiar
                </button>
              </div>
              
              <textarea
                value={editedCode}
                onChange={(e) => setEditedCode(e.target.value)}
                className="w-full h-80 px-3 py-2 border border-gray-300 rounded-md font-mono text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Código será gerado aqui..."
              />
            </div>

            <div className="flex justify-between mt-8">
              <button
                onClick={() => setCurrentStep('upload')}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                onClick={generateBDD}
                disabled={isLoading || !editedCode}
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-md hover:from-green-700 hover:to-teal-700 disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    {pollingStatus || 'Gerando Testes...'}
                  </div>
                ) : (
                  'Gerar Testes BDD'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Download Step */}
        {currentStep === 'download' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Arquivos Gerados</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="border rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2">
                  {selectedLanguage === 'python' ? '🐍' : '☕'} Código {selectedLanguage === 'python' ? 'Python' : 'Java'}
                </h3>
                <div className="bg-gray-50 rounded p-3 h-32 overflow-y-auto">
                  <pre className="text-xs text-gray-600">{editedCode.substring(0, 200)}...</pre>
                </div>
              </div>
              
              <div className="border rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2">🧪 Testes BDD</h3>
                <div className="bg-gray-50 rounded p-3 h-32 overflow-y-auto">
                  <pre className="text-xs text-gray-600">{bddTest.substring(0, 200)}...</pre>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                onClick={resetFlow}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Nova Geração
              </button>
              <button
                onClick={downloadFiles}
                className="flex items-center px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                Download Arquivos
              </button>
            </div>
          </div>
        )}

        {/* File Preview Modal */}
        {showFilePreview && uploadedFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-6 border-b">
                <div className="flex items-center space-x-3">
                  <DocumentTextIcon className="h-6 w-6 text-blue-600" />
                  <div>
                    <h3 className="text-lg font-semibold">Preview do Arquivo</h3>
                    <p className="text-sm text-gray-500">{uploadedFile.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFilePreview(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <XMarkIcon className="h-5 w-5 text-gray-500" />
                </button>
              </div>
              
              <div className="flex-1 p-6 overflow-auto">
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700">{fileContent}</pre>
                </div>
              </div>
              
              <div className="flex justify-between items-center p-6 border-t bg-gray-50">
                <div className="text-sm text-gray-500">
                  {fileContent.trim().length} caracteres • {fileContent.split('\n').length} linhas
                </div>
                <button
                  onClick={() => setShowFilePreview(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-center text-gray-500 text-sm">
            <p>© 2024 Desktop - Powered by Compass UOL & AWS</p>
            <p className="mt-2">Proof of Concept - Gerador de Código com Inteligência Artificial</p>
          </div>
        </div>
      </footer>
    </div>
  );
}