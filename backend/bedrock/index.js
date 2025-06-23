import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = {
  extract_content_prompt: path.join(__dirname, 'files/extract_content_prompt.txt'),
  generate_python_code_prompt: path.join(__dirname, 'files/generate_python_code_prompt.txt'),
  generate_java_code_prompt: path.join(__dirname, 'files/generate_java_code_prompt.txt'),
  context: path.join(__dirname, 'files/context.txt'),
  user_history: path.join(__dirname, 'files/user_history.txt')
};

const readFile = p => fs.readFileSync(p, { encoding: 'latin1' }).trim();

export function prepareJsonBody({
  maxTokens = 4000,
  temperature = 0.7,
  topP = 0.9,
  topK = 1
} = {}) {
  return {
    configuration: {
      extract_content_model: 'amazon.nova-pro-v1:0',
      extract_content_prompt: readFile(files.extract_content_prompt),
      generate_python_code_model: 'amazon.nova-pro-v1:0',
      generate_python_code_prompt: readFile(files.generate_python_code_prompt),
      generate_java_code_model: 'amazon.nova-pro-v1:0',
      generate_java_code_prompt: readFile(files.generate_java_code_prompt),
      max_tokens: maxTokens,
      temperature,
      top_p: topP,
      top_k: topK
    },
    user_data: {
      language: 'java',
      context: readFile(files.context),
      user_history: readFile(files.user_history)
    }
  };
}

export async function makeRequest(ctrl = {}) {
  const API_URL = 'https://c2eki2oz75.execute-api.us-east-1.amazonaws.com/generate_code';
  const OUTPUT_FILE = path.join(__dirname, 'files/result.json');
  const jsonBody = prepareJsonBody(ctrl);

  console.log('Enviando requisição para API...');
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(jsonBody)
  });

  if (!response.ok) {
    console.error(`Erro na requisição inicial: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const { downloadUrl } = await response.json();
  if (!downloadUrl) {
    console.error('downloadUrl não encontrado na resposta');
    process.exit(1);
  }

  console.log(`Download URL: ${downloadUrl}`);
  console.log('Aguardando arquivo estar pronto para download...');

  let attempts = 0;
  const maxAttempts = 60;
  let downloadData;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      const res = await fetch(downloadUrl);
      if (res.ok) {
        downloadData = await res.json();
        console.log(`Arquivo disponível e baixado após ${attempts} tentativa(s).`);
        break;
      } else {
        console.log(`Arquivo não pronto ainda (tentativa ${attempts}): ${res.status}`);
      }
    } catch (err) {
      console.log(`Erro na tentativa ${attempts}: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  if (!downloadData) {
    console.error('Tempo limite atingido. O arquivo não ficou pronto.');
    process.exit(1);
  }

  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(downloadData, null, 2), 'utf8');
    console.log(`Arquivo salvo em ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('Erro ao salvar o arquivo:', err.message);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  makeRequest();
}
