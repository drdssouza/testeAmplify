import { callBedrock } from '/opt/nodejs/index.js';

const normalize = e => typeof e === 'string' ? JSON.parse(e) : e?.body ? (typeof e.body === 'string' ? JSON.parse(e.body) : e.body) : e;

export const handler = async event => {
  const body = normalize(event);
  const {
    filename = null,
    start_timestamp = Date.now(),
    configuration = {},
    user_data = {},
    extracted_data = {}
  } = body;

  const lang = (user_data.language || 'java').toLowerCase();
  const modelKey = `generate_${lang}_code_model`;
  const promptKey = `generate_${lang}_code_prompt`;

  const modelId  = configuration[modelKey]  || 'amazon.nova-pro-v1:0';
  const basePrompt = configuration[promptKey] || `Gere um código ${lang} Hello World.`;
  const control = {
    maxTokens:   configuration.max_tokens   ?? 300,
    temperature: configuration.temperature  ?? 0.7,
    topP:        configuration.top_p        ?? 0.9,
    topK:        configuration.top_k        ?? 1
  };

  const userPrompt   = `${basePrompt}\n${extracted_data?.data ?? ''}`;
  const systemPrompt = user_data.context || `Você é um gerador de código ${lang}.`;

  try {
    const res = await callBedrock({ modelId, userPrompt, systemPrompt, ...control });
    const code_generated = { statuscode: res.statuscode, data: res.response };

    return {
      statuscode: code_generated.statuscode,
      filename,
      start_timestamp,
      configuration,
      user_data,
      extracted_data,
      code_generated
    };
  } catch (err) {
    return {
      statuscode: 500,
      filename,
      start_timestamp,
      configuration,
      user_data,
      extracted_data,
      error: err.message || 'Unknown error'
    };
  }
};
