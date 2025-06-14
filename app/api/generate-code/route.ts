import { NextApiRequest, NextApiResponse } from 'next';
import { StepLLMSelections } from '../../types/llm-types';

interface GenerateCodeRequest {
  userStory: string;
  language: 'python' | 'java';
  llmSelections: StepLLMSelections;
  requestId: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userStory, language, llmSelections, requestId }: GenerateCodeRequest = req.body;

    // Validação dos dados
    if (!userStory || !language || !llmSelections || !requestId) {
      return res.status(400).json({ 
        error: 'Campos obrigatórios: userStory, language, llmSelections, requestId' 
      });
    }

    // Preparar payload para AWS Step Functions
    const stepFunctionPayload = {
      userStory,
      language,
      requestId,
      // Modelos LLM para cada etapa
      models: {
        extractHistory: {
          family: llmSelections.extractHistory?.family,
          model: llmSelections.extractHistory?.model
        },
        generateCode: {
          family: llmSelections.generateCode?.family,
          model: llmSelections.generateCode?.model
        },
        generateBDD: {
          family: llmSelections.generateBDD?.family,
          model: llmSelections.generateBDD?.model
        }
      }
    };

    // Simular chamada para AWS Step Functions
    console.log('Enviando para Step Functions:', stepFunctionPayload);
    
    // Em implementação real, aqui seria:
    // const stepFunctions = new AWS.StepFunctions();
    // const execution = await stepFunctions.startExecution({
    //   stateMachineArn: process.env.STEP_FUNCTION_ARN,
    //   input: JSON.stringify(stepFunctionPayload)
    // }).promise();

    // Simular resposta com presigned URL
    const presignedUrl = `https://temp-storage.s3.amazonaws.com/${requestId}/response.json`;

    return res.status(200).json({
      success: true,
      requestId,
      presignedUrl,
      selectedModels: stepFunctionPayload.models
    });

  } catch (error) {
    console.error('Erro ao processar requisição:', error);
    return res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

// Função auxiliar para mapear modelos LLM para identificadores AWS Bedrock
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

// Exemplo de uso nas Lambdas
export function updateLambdaForLLMSelection() {
  // Em extractHistory.py, seria algo assim:
  /*
  def lambda_handler(event, context):
      # Extrair modelo selecionado
      selected_model = event.get('models', {}).get('extractHistory', {})
      family = selected_model.get('family', 'amazon-nova')
      model = selected_model.get('model', 'pro')
      
      # Mapear para identificador Bedrock
      bedrock_model_id = map_llm_to_bedrock_model(family, model)
      
      # Usar o modelo na chamada do Bedrock
      bedrock_client = boto3.client('bedrock-runtime')
      response = bedrock_client.invoke_model(
          modelId=bedrock_model_id,
          body=json.dumps({
              "messages": [{"role": "user", "content": prompt}],
              "max_tokens": 8000,
              "temperature": 0.1
          })
      )
  */
}