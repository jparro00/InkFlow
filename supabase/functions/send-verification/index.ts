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

function generateCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1000000).padStart(6, "0");
}

function buildEmailHtml(code: string): string {
  const digits = code.split("");
  const digitCells = digits
    .map(
      (d) =>
        `<td style="width:44px;height:52px;background-color:#1A1525;border:1px solid #342D42;border-radius:8px;text-align:center;vertical-align:middle;font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:0;">${d}</td>`
    )
    .join('<td style="width:8px;"></td>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Ink Bloop Verification</title>
</head>
<body style="margin:0;padding:0;background-color:#110D18;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#110D18;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background-color:#241E30;border-radius:16px;border:1px solid #342D42;">

<!-- Logo + Title -->
<tr><td style="padding:32px 32px 8px;text-align:center;">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:rgba(255,255,255,0.87);margin-bottom:4px;">Ink Bloop</div>
  <div style="font-size:10px;color:rgba(255,255,255,0.38);text-transform:uppercase;letter-spacing:2px;">Studio Management</div>
</td></tr>

<!-- Divider -->
<tr><td style="padding:16px 32px 0;">
  <div style="height:1px;background-color:#342D42;"></div>
</td></tr>

<!-- Message -->
<tr><td style="padding:24px 32px 8px;text-align:center;">
  <div style="font-size:15px;color:rgba(255,255,255,0.60);line-height:1.5;">New device detected. Enter this code to verify it's you:</div>
</td></tr>

<!-- Code -->
<tr><td style="padding:16px 32px;text-align:center;">
  <table role="presentation" cellpadding="0" cellspacing="0" align="center">
    <tr>${digitCells}</tr>
  </table>
</td></tr>

<!-- Expire notice -->
<tr><td style="padding:8px 32px 32px;text-align:center;">
  <div style="font-size:12px;color:rgba(255,255,255,0.38);">This code expires in 5 minutes</div>
</td></tr>

<!-- Footer -->
<tr><td style="padding:0 32px 24px;text-align:center;">
  <div style="height:1px;background-color:#342D42;margin-bottom:16px;"></div>
  <div style="font-size:11px;color:rgba(255,255,255,0.25);line-height:1.4;">If you didn't try to sign in, you can safely ignore this email.</div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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

    // Clean up old unused codes for this user
    await supabase
      .from("verification_codes")
      .delete()
      .eq("user_id", user.id)
      .eq("used", false);

    // Generate and store new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error: insertErr } = await supabase
      .from("verification_codes")
      .insert({ user_id: user.id, code, expires_at: expiresAt });

    if (insertErr) return json({ error: "Failed to create code" }, 500);

    // Send email via Resend
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "Email service not configured" }, 500);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Ink Bloop <verify@inkbloop.com>",
        to: [user.email],
        subject: `${code} is your Ink Bloop verification code`,
        html: buildEmailHtml(code),
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      console.error("Resend error:", errBody);
      return json({ error: "Failed to send email" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
