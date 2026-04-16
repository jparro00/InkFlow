import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, clients } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch encrypted API key
    const { data: settings } = await supabase
      .from("user_settings")
      .select("anthropic_key")
      .eq("user_id", user.id)
      .single();

    if (!settings?.anthropic_key) {
      return new Response(JSON.stringify({ error: "No API key configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = Deno.env.get("API_KEY_SECRET");
    if (!secret) {
      return new Response(JSON.stringify({ error: "Server encryption not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = await decrypt(settings.anthropic_key, secret);

    // Build the same prompt used client-side
    const now = new Date();
    const clientList = (clients || []) as Array<{ id: string; name: string }>;

    const systemPrompt = `You extract booking details from text for a tattoo studio. Return a JSON object.

Today: ${now.toISOString().split("T")[0]} (${now.toLocaleDateString("en-US", { weekday: "long" })}). Current year: ${now.getFullYear()}.

Clients: ${clientList.map((c) => `${c.id}="${c.name}"`).join(", ")}

Types: "Regular", "Touch Up", "Consultation", "Full Day", "Cover Up"

JSON fields (omit any you can't determine, NEVER add error messages):
- client_id: match to an ID above (fuzzy first-name match OK). If no match, omit this field entirely.
- date: ISO 8601 datetime (e.g. "2026-04-15T14:00:00"). Day names like "Sunday" or "next Thursday" mean the NEXT upcoming occurrence from today. Two adjacent digits like "52" or "five two" mean month/day (e.g. "52" = May 2nd, "121" = December 1st, "415" = April 15th).
- duration: number (hours). ONLY include if the user explicitly mentions a duration. Do NOT guess or infer a duration.
- type: one of the types above
- estimate: number (dollars)
- rescheduled: boolean (true ONLY if the user explicitly says this is a reschedule, rescheduled, or being moved from another date)
- timeSlot: "morning" or "evening" — if the user says "morning", "AM", "morning appointment", use "morning". If they say "evening", "afternoon", "PM", "evening appointment", use "evening". This overrides the time in the date field. If they give a specific time like "2pm", do NOT use timeSlot — put the time in the date field instead.
- notes: string (ONLY verbatim details the user provided about the tattoo — placement, style, design, special requests. NEVER use this field to communicate with the user, store client names, or add any information the user did not explicitly say.)

CRITICAL: Always extract every field you can. A missing client match must NOT prevent you from extracting date, time, type, duration, estimate, or notes. Never put error messages or explanations in any field. Return ONLY valid JSON.`;

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
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Anthropic API error: ${response.status}`, details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const rawContent = data.content?.[0]?.text ?? "{}";
    const content = rawContent.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }

    // Validate fields server-side
    const DURATION_PATTERN = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i;
    const result: Record<string, unknown> = {};

    if (parsed.client_id && clientList.some((c) => c.id === parsed.client_id)) {
      result.client_id = parsed.client_id;
    }
    if (parsed.date) result.date = parsed.date;
    if (typeof parsed.duration === "number" && DURATION_PATTERN.test(text)) {
      result.duration = parsed.duration;
    }
    if (parsed.type && ["Regular", "Touch Up", "Consultation", "Full Day", "Cover Up"].includes(parsed.type)) {
      result.type = parsed.type;
    }
    if (typeof parsed.estimate === "number") result.estimate = parsed.estimate;
    if (parsed.rescheduled === true) result.rescheduled = true;
    if (parsed.timeSlot === "morning" || parsed.timeSlot === "evening") result.timeSlot = parsed.timeSlot;
    if (parsed.notes) result.notes = parsed.notes;

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
