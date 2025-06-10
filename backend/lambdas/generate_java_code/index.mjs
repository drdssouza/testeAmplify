
const normalize = (event) => {
  if (typeof event === "string") return JSON.parse(event)
  if (event?.body) return typeof event.body === "string" ? JSON.parse(event.body) : event.body
  return event
}

export const handler = async (event) => {
  try {
    const resultData = normalize(event)
    const filename = resultData.filename ?? null
    const language = resultData.data?.language ?? "java"
    const context = resultData.data?.extracted ?? "world"

    const code = `public class HelloWorld {
        public static void main(String[] args) {
            System.out.println("Hello, ${context}");
        }
    }`

    const codeResponse = {
      statusCode: 200,
      filename,
      data: {
        language,
        code_generated: code
      }
    }
    return codeResponse
  } catch (err) {
    return { statusCode: 500, error: err.message ?? "Unknown error" }
  }
}
