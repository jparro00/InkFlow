// Returns the caller's public IP and user agent as Supabase saw them.
//
// Used by the public consent-form wizard at mount time so the client has
// audit fields available BEFORE the user reaches the signing step. Without
// this pre-flight, IP/UA only land in state after the license upload
// completes (which can lag on slow connections), and a fast user can hit
// "Adopt and Sign" before the upload-url response returns — leaving the
// signed PDF's metadata empty.
//
// No body, no auth, no validation — this is a read-only echo of request
// headers. Deploy with --no-verify-jwt like the other consent-* fns since
// the public wizard has no Supabase session.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function clientIpFromRequest(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "";
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const body = JSON.stringify({
    client_ip: clientIpFromRequest(req),
    client_user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? "",
  });

  return new Response(body, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
