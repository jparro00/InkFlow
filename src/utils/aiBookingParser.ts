import { useClientStore } from '../stores/clientStore';

interface ParsedBooking {
  client_id?: string;
  date?: string;
  duration?: number;
  type?: string;
  estimate?: number;
  notes?: string;
}

export async function parseBookingWithAI(text: string, apiKey: string): Promise<ParsedBooking> {
  const clients = useClientStore.getState().clients;
  const clientList = clients.map((c) => ({ id: c.id, name: c.name }));
  const now = new Date();

  const systemPrompt = `You are a booking assistant for a tattoo studio. Extract booking details from the user's text and return a JSON object.

Today's date is ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('en-US', { weekday: 'long' })}).

Available clients:
${clientList.map((c) => `- id: "${c.id}", name: "${c.name}"`).join('\n')}

Booking types (use exactly one): "Regular", "Touch Up", "Consultation", "Full Day"

Return a JSON object with these fields (omit any you can't determine):
- client_id: string (match to a client ID from the list above, use fuzzy first-name matching)
- date: ISO 8601 datetime string (e.g. "2026-04-15T14:00:00")
- duration: number (hours, e.g. 2.5)
- type: string (one of the booking types above)
- estimate: number (dollar amount, no $ sign)
- notes: string (any additional details not captured by other fields)

Return ONLY valid JSON, no markdown, no explanation.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const rawContent = data.content?.[0]?.text ?? '{}';
  // Strip markdown code fences if present
  const content = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(content);
    const result: ParsedBooking = {};

    if (parsed.client_id && clientList.some((c) => c.id === parsed.client_id)) {
      result.client_id = parsed.client_id;
    }
    if (parsed.date) result.date = parsed.date;
    if (typeof parsed.duration === 'number') result.duration = parsed.duration;
    if (parsed.type && ['Regular', 'Touch Up', 'Consultation', 'Full Day'].includes(parsed.type)) {
      result.type = parsed.type;
    }
    if (typeof parsed.estimate === 'number') result.estimate = parsed.estimate;
    if (parsed.notes) result.notes = parsed.notes;

    return result;
  } catch {
    // If AI returns invalid JSON, fall back to empty
    return {};
  }
}
