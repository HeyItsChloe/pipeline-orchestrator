export async function callClaude({ system, prompt, maxTokens = 2000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set — the "llm" engine needs it as a repo secret. Use --engine=deterministic instead, or add the secret.',
    )
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API request failed: ${res.status} ${res.statusText} — ${body}`)
  }

  const data = await res.json()
  return data.content.map((block) => block.text).join('\n')
}

export function parseEngineArg(defaultEngine = 'deterministic') {
  const arg = process.argv.find((a) => a.startsWith('--engine='))
  const engine = arg ? arg.split('=')[1] : defaultEngine
  if (!['deterministic', 'llm'].includes(engine)) {
    throw new Error(`Unknown engine "${engine}" — expected "deterministic" or "llm".`)
  }
  return engine
}
