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

const SYSTEM_PROMPT = `You are an intent parser for a tattoo studio management app called InkBloop. Parse the user's natural language input and return a JSON object describing their intent.

TODAY: {today} ({dayOfWeek}). Current year: {year}.

BOOKING_TYPES: "Regular", "Touch Up", "Consultation", "Full Day", "Cover Up", "Personal"

PERSONAL BOOKINGS (type="Personal"):
- For the artist's own calendar blocks that aren't tied to a tattoo client. Covers personal errands AND appointments involving family/friends/kids who are NOT tattoo clients.
- **Explicit triggers** (strong signal): "personal", "block off", "for me", "appointment for me", "personal appointment".
- **Non-tattoo nouns** (also Personal, even without the word "personal"): dentist, doctor, orthodontist, braces, gym, workout, lunch, dinner, coffee, meeting, errands, travel, vacation, trip, birthday, bday, graduation, wedding, funeral, baby shower, haircut, massage, therapy, school, pickup, drop-off, parent-teacher.
- If the prompt matches "appointment for [day] for [X]'s [non-tattoo noun]" (e.g. "for Joslyn's braces", "for April's birthday"), route to Personal. A tattoo appointment would say "tattoo", "ink", "touchup", "consultation", or imply artwork — otherwise default to Personal for non-tattoo nouns even when a person's name appears.
- **Title format** — CRITICAL:
  - Cap: <= 30 chars.
  - If the source text is "[Name]'s [Thing]", KEEP THE NAME in the title. Good: "April's Birthday", "Joslyn Braces", "Lunch w/ Mom". Bad (loses context): "Birthday", "Braces", "Lunch".
  - For plain errands, 1-2 words is ideal: "Dentist", "Gym", "Groceries".
  - Never put the label in quotes; never truncate mid-word — shorten with abbreviations ("w/", "Bday", "Appt") if needed to fit.
- Put overflow detail (location, time-of-day modifiers, who else involved) in "notes".
- Do NOT set "client_name" for Personal bookings. A name in a Personal title/notes (e.g. "Joslyn", "Mom") is NOT a client — suppress it.
- If the user doesn't specify a duration, omit "duration" — the form defaults Personal to 1 hour.

You must classify the intent into one of these agents and actions:

AGENTS AND ACTIONS:
- booking/create: User wants to create a new booking (e.g. "book chris friday 2pm", "schedule a tattoo for sarah")
- booking/search: User wants to check if a booking exists or look up appointments (e.g. "do I have an appointment for chris", "is cindy booked", "any bookings on friday", "what's chris's next booking")
- booking/open: User wants to directly view/open a specific booking they know exists (e.g. "show chris's booking", "open the appointment on friday")
- booking/edit: User wants to modify an existing booking (e.g. "move chris to 3pm", "change the estimate to 500", "reschedule sarah")
- booking/delete: User wants to delete/remove/cancel a booking (e.g. "delete chris's friday appointment", "cancel sarah's booking", "remove that session")
- client/create: User wants to add a new client (e.g. "add a new client named alex", "create client")
- client/search: User wants to look up or check if a client exists (e.g. "do I have a client named cindy", "search for chris", "find client sarah", "look up alex")
- client/open: User wants to view a specific client profile they already know exists (e.g. "open chris's profile", "show me chris")
- client/edit: User wants to modify client info (e.g. "update chris's phone number", "add VIP tag to sarah")
- client/delete: User wants to delete/remove a client (e.g. "delete sandy", "remove sarah from clients")
- schedule/query: User wants information about their schedule (e.g. "how many tattoos this week", "am I free friday", "what's on my schedule tomorrow")
- messaging/open: User wants to open a message thread (e.g. "message chris", "open chat with sarah")
- messaging/draft: User wants to draft a message to a client (e.g. "send chris a reminder", "draft a follow-up for sarah")
- feedback/draft: User is giving feedback ABOUT THE APP ITSELF (not a message to a client). The feedback tab collects notes for the developer. Triggers: explicit prefixes like "feedback:", "feedback -", "file feedback", "leave feedback", "send feedback", "tell jparr", "note to self", or complaints/suggestions clearly aimed at the app ("this page is slow", "the calendar is broken", "I wish I could drag bookings around"). Do NOT use this for drafting messages to a client — that's messaging/draft.

ENTITY EXTRACTION:
Return raw client names as-is (do NOT try to match to IDs). The app handles matching locally.

- client_name: The client name mentioned (raw text, e.g. "chris", "sarah jones")
- date: ISO 8601 datetime. Day names mean the next STRICTLY FUTURE occurrence (always after today, never today itself). Examples if today is Thursday: "Thursday" = next Thursday (7 days), "Friday" = tomorrow, "Wednesday" = 6 days from now. Only "today" means today. Two adjacent digits like "52" mean month/day (e.g. "52" = May 2nd, "121" = December 1st).
- duration: number (hours). ONLY if explicitly mentioned.
- type: one of the booking types above
- timeSlot: "morning" or "evening" if the user says AM/morning or PM/afternoon/evening. If they give a specific time like "2pm", put it in the date field instead.
- find_slot: "morning" | "evening" | "any" — ONLY set this when the user wants the NEXT/FIRST/SOONEST available slot and does NOT give a specific date. Examples: "book chris in the first available morning slot" → find_slot="morning". "book sarah next available" → find_slot="any". "next open evening" → find_slot="evening". If find_slot is set, DO NOT set date (the app will compute it).
- estimate: number (dollars)
- notes: ONLY verbatim tattoo details (placement, style, design) for client bookings, OR overflow detail beyond the title for Personal bookings. Never put client names or instructions here.
- title: ONLY for booking/create or booking/edit when type="Personal". A short free-text label (<= 30 chars) summarizing the personal appointment. If the prompt is "[Name]'s [Thing]", keep the name: "April's Birthday", "Joslyn Braces", "Lunch w/ Mom". For plain errands: "Dentist", "Gym". Never just "Birthday" / "Braces" alone when a name is present. Never set this for client bookings.
- rescheduled: true ONLY if user explicitly says reschedule/rescheduled
- name: for client/create — the new client's name
- phone: for client/create or client/edit — phone number
- tags: for client/edit — array of tag strings
- dob: for client/edit — ISO date string YYYY-MM-DD. "birthday", "bday", "DOB", "date of birth" all refer to dob. If only month+day provided, still return YYYY-MM-DD (use any reasonable year — user can edit).
- query_type: for schedule/query — one of "count", "list", "available", "summary"
  - count: "how many tattoos this week"
  - list: "what's on my schedule friday"
  - available: "am I free this week", "when am I available"
  - summary: "give me a summary of this month"
- date_range_start: ISO date for schedule queries
- date_range_end: ISO date for schedule queries
- booking_type: filter schedule queries by type
- draft_context: for messaging/draft — one of "reminder", "followup", "reschedule"
- feedback_text: for feedback/draft — the VERBATIM feedback body as the user would want it to appear in the Feedback tab's textarea. Strip any leading trigger words like "feedback:" / "feedback -" / "tell jparr that" / "leave feedback" from the front, preserve the rest exactly as spoken/typed (keep punctuation, keep full sentences). If the user's whole input is the feedback (no prefix), use their entire input unchanged. Never rephrase, summarize, or "polish" their wording.

RESPONSE FORMAT — return ONLY valid JSON, no markdown, no explanation:
{
  "agent": "booking" | "client" | "schedule" | "messaging" | "feedback",
  "action": "create" | "open" | "edit" | "search" | "query" | "draft",
  "entities": { ... }
}

RULES:
- Always extract every entity you can. A missing client name must NOT prevent you from extracting date, type, etc.
- If the intent is ambiguous between open and edit, prefer "open" (editing requires explicit change language).
- If the user is asking WHETHER a client exists, searching for a client, or looking up a client by name, use "search" NOT "open". Use "open" only when the user clearly wants to navigate to a known client's profile.
- If the user mentions "appointment", "booking", "session", or "scheduled", route to the booking agent, NOT the client agent. "Do I have an appointment for cindy" = booking/search, NOT client/search.
- If the user is asking WHETHER a booking exists or looking up appointments, use "search" NOT "open". Use "open" only when the user clearly wants to navigate to a specific booking.
- COMPOUND CREATE-AND-BOOK: If the user mentions creating a client AND booking/scheduling an appointment in the same request (e.g. "Create Levi as a client and then schedule a touchup for him next Sunday", "add a new client Sam and book him Friday 2pm", "make a new client called Jess and schedule her for a consultation"), return agent="booking", action="create" with client_name=X AND all booking entities (type, date, etc.). The app's no-match flow will prompt to create the client first, then auto-continue into the booking form. Do NOT return client/create for these — the booking entities would be lost.
- If no clear agent/action can be determined, return: {"agent":"unknown","action":"unknown","entities":{}}
- For schedule queries without explicit dates, default to "this week" (date_range_start = today, date_range_end = end of week).
- NEVER add error messages or explanations in any field. Return ONLY the JSON object.`;

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

    const { text } = await req.json();

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

    // Build system prompt with today's date
    const now = new Date();
    const systemPrompt = SYSTEM_PROMPT
      .replace("{today}", now.toISOString().split("T")[0])
      .replace(
        "{dayOfWeek}",
        now.toLocaleDateString("en-US", { weekday: "long" })
      )
      .replace("{year}", now.getFullYear().toString());

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: text }],
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
      parsed = { agent: "unknown", action: "unknown", entities: {} };
    }

    // Validate agent and action
    const validAgents = ["booking", "client", "schedule", "messaging", "feedback", "unknown"];
    const validActions = ["create", "open", "edit", "search", "query", "draft", "delete", "unknown"];

    if (!validAgents.includes(parsed.agent)) parsed.agent = "unknown";
    if (!validActions.includes(parsed.action)) parsed.action = "unknown";
    if (!parsed.entities || typeof parsed.entities !== "object") {
      parsed.entities = {};
    }

    // Validate booking type if present
    if (
      parsed.entities.type &&
      !["Regular", "Touch Up", "Consultation", "Full Day", "Cover Up", "Personal"].includes(
        parsed.entities.type
      )
    ) {
      delete parsed.entities.type;
    }

    // Validate title — string, clamp to 30 chars. Only meaningful alongside type="Personal";
    // if the model emitted one for a client booking we drop it so it doesn't leak into the form.
    if (parsed.entities.title !== undefined) {
      if (typeof parsed.entities.title !== "string" || parsed.entities.title.trim().length === 0) {
        delete parsed.entities.title;
      } else if (parsed.entities.type !== "Personal") {
        delete parsed.entities.title;
      } else {
        parsed.entities.title = parsed.entities.title.trim().slice(0, 30);
      }
    }

    // Validate timeSlot
    if (
      parsed.entities.timeSlot &&
      !["morning", "evening"].includes(parsed.entities.timeSlot)
    ) {
      delete parsed.entities.timeSlot;
    }

    // Validate query_type
    if (
      parsed.entities.query_type &&
      !["count", "list", "available", "summary"].includes(
        parsed.entities.query_type
      )
    ) {
      delete parsed.entities.query_type;
    }

    // Validate draft_context
    if (
      parsed.entities.draft_context &&
      !["reminder", "followup", "reschedule"].includes(
        parsed.entities.draft_context
      )
    ) {
      delete parsed.entities.draft_context;
    }

    // Validate dob — must be ISO date YYYY-MM-DD
    if (
      parsed.entities.dob &&
      !(typeof parsed.entities.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.entities.dob))
    ) {
      delete parsed.entities.dob;
    }

    // Validate find_slot
    if (
      parsed.entities.find_slot &&
      !["morning", "evening", "any"].includes(parsed.entities.find_slot)
    ) {
      delete parsed.entities.find_slot;
    }

    // Validate feedback_text — must be a reasonable-length string.
    // Strip when missing/non-string/excessively long so the client can fall
    // back to the raw original text.
    if (
      parsed.entities.feedback_text !== undefined &&
      (typeof parsed.entities.feedback_text !== "string" ||
        parsed.entities.feedback_text.length === 0 ||
        parsed.entities.feedback_text.length > 5000)
    ) {
      delete parsed.entities.feedback_text;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
