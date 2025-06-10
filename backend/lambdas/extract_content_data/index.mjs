
const normalize = (event) => {
  if (typeof event === "string") return JSON.parse(event)
  if (event?.body) return typeof event.body === "string" ? JSON.parse(event.body) : event.body
  return event
}

export const handler = async (event) => {
  try {
    const body = normalize(event)
    const { filename = null, language = null, data: inputData = null } = body
    
    const extracted = typeof inputData === "string" ? inputData.trim().slice(0, 200) : inputData

    const resultData = {
      statusCode: 200,
      filename,
      data: {
        language,
        extracted
      }
    }
    return resultData
  } catch (err) {
    return { statusCode: 500, error: err.message ?? "Unknown error" }
  }
}
