import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function decrypt(ciphertext: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret.padEnd(32, "0").slice(0, 32)),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    data
  );
  return new TextDecoder().decode(decrypted);
}

const SYSTEM_PROMPT = `You are a data editor for a tattoo studio management app. Given a client's current data and a user's edit request, determine what the new field values should be.

You will receive the client's current data as JSON and a natural language edit request from the user.

Return ONLY valid JSON with the fields that should be updated:
{
  "name": "new full name if changed",
  "phone": "new phone if changed",
  "tags": ["new", "tags", "if changed"]
}

RULES:
- Only include fields that the user wants to change. Omit unchanged fields entirely.
- For name changes, return the FULL name (first + last), not just the part that changed.
- For tags, return the complete final tag list (existing tags + additions, minus removals).
- Return ONLY valid JSON, no markdown, no explanation.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, client } = await req.json();

    if (!text || typeof text !== "string" || !client) {
      return new Response(
        JSON.stringify({ error: "Missing text or client data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch encrypted API key
    const { data: settings } = await supabase
      .from("user_settings")
      .select("anthropic_key")
      .eq("user_id", user.id)
      .single();

    if (!settings?.anthropic_key) {
      return new Response(
        JSON.stringify({ error: "No API key configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const secret = Deno.env.get("API_KEY_SECRET");
    if (!secret) {
      return new Response(
        JSON.stringify({ error: "Server encryption not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const apiKey = await decrypt(settings.anthropic_key, secret);

    const userMessage = `Client's current data: ${JSON.stringify(client)}

User's edit request: "${text}"`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(
        JSON.stringify({
          error: `Anthropic API error: ${response.status}`,
          details: errText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const rawContent = data.content?.[0]?.text ?? "{}";
    const content = rawContent
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate — only allow known fields
    const result: Record<string, unknown> = {};
    if (typeof parsed.name === "string") result.name = parsed.name;
    if (typeof parsed.phone === "string") result.phone = parsed.phone;
    if (Array.isArray(parsed.tags)) {
      result.tags = parsed.tags.filter((t: unknown) => typeof t === "string");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
