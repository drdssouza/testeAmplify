// lambda_generate_python_code/index.mjs
export const handler = async (event) => {
  try {
    console.log("generate_python_code input:", JSON.stringify(event));

    /*-------------------------------------------------
     * Normaliza o payload vindo da etapa anterior
     *  ─ Se vier como string JSON → parse
     *  ─ Se vier dentro de event.body   → parse se string
     *  ─ Se vier já como objeto        → usa direto
     *------------------------------------------------*/
    const resultData = (() => {
      if (typeof event === "string") return JSON.parse(event);
      if (event?.body) {
        return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      }
      return event;
    })();

    // A etapa anterior devolveu { statusCode:200, data:{ language, extracted } }
    const language = resultData.data?.language ?? "python";
    const context  = resultData.data?.extracted ?? "world";

    /*-------------------------------------------------
     * Geração de código em Python
     *------------------------------------------------*/
    const code = `def main():
    print("Hello, ${context}")

if __name__ == "__main__":
    main()
`;

    const codeResponse = {
      statusCode: 200,
      data: {
        language: language,
        code_generated: code
      }
    };

    console.log("generate_python_code output:", JSON.stringify(codeResponse));
    return codeResponse;
  } catch (err) {
    console.error("generate_python_code ERROR:", err);
    return {
      statusCode: 500,
      error: err.message ?? "Unknown error"
    };
  }
};
