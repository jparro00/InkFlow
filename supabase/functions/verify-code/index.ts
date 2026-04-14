import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { code, deviceId, deviceName } = await req.json();

    if (!code || !deviceId) {
      return json({ error: "Missing code or deviceId" }, 400);
    }

    // Find valid, unused code for this user
    const { data: codeRow, error: fetchErr } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("user_id", user.id)
      .eq("code", code)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();

    if (fetchErr || !codeRow) {
      return json({ error: "Invalid or expired code" }, 400);
    }

    // Mark code as used
    await supabase
      .from("verification_codes")
      .update({ used: true })
      .eq("id", codeRow.id);

    // Upsert device trust
    const { error: trustErr } = await supabase
      .from("device_trusts")
      .upsert(
        {
          user_id: user.id,
          device_id: deviceId,
          device_name: deviceName || null,
          last_used: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" }
      );

    if (trustErr) {
      // Upsert by manual check if no unique constraint
      const { data: existing } = await supabase
        .from("device_trusts")
        .select("id")
        .eq("user_id", user.id)
        .eq("device_id", deviceId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("device_trusts")
          .update({ last_used: new Date().toISOString(), device_name: deviceName || null })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("device_trusts")
          .insert({
            user_id: user.id,
            device_id: deviceId,
            device_name: deviceName || null,
          });
      }
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
