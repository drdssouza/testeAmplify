import { callBedrock } from '/opt/nodejs/index.js';

const normalize = e => typeof e === 'string' ? JSON.parse(e) : e?.body ? (typeof e.body === 'string' ? JSON.parse(e.body) : e.body) : e;

export const handler = async event => {
  const body = normalize(event);
  const {
    filename        = null,
    start_timestamp = Date.now(),
    configuration   = {},
    user_data       = {}
  } = body;

  const modelId     = configuration.extract_content_model  || 'amazon.nova-pro-v1:0';
  const basePrompt  = configuration.extract_content_prompt || 'Leia atentamente o texto a seguir:';
  const control = {
    maxTokens:   configuration.max_tokens   ?? 300,
    temperature: configuration.temperature  ?? 0.7,
    topP:        configuration.top_p        ?? 0.9,
    topK:        configuration.top_k        ?? 1
  };

  const userPrompt   = `${basePrompt}\n\n${user_data.user_history || ''}`;
  const systemPrompt = user_data.context || 'Você é um assistente prestativo.';

  try {
    const res = await callBedrock({ modelId, userPrompt, systemPrompt, ...control });
    const extracted_data = { statuscode: res.statuscode, data: res.response };
    return {
      statuscode: extracted_data.statuscode,
      filename,
      start_timestamp,
      configuration,
      user_data,
      extracted_data
    };
  } catch (err) {
    return {
      statuscode: 500,
      filename,
      start_timestamp,
      configuration,
      user_data,
      error: err.message || 'Unknown error'
    };
  }
};
