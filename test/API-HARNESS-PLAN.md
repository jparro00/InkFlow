# API Test Harness Plan

A shell script (`test/api-harness.sh`) to exercise InkFlow API endpoints and inspect full HTTP request/response.

## Config

- Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env`
- Hardcodes sim_config values (access_token, page_id, etc.) since they rarely change
- Uses `curl -D` to capture response headers, `python -m json.tool` to pretty-print JSON

## Commands

| Command | What it does | Hits |
|---------|-------------|------|
| `sim-profiles` | List all test contacts | GET sim-api |
| `sim-conversations` | List all sim conversations + messages | GET sim-api |
| `sim-send <psid> <text>` | Send message as a contact (triggers full webhook chain) | POST sim-api -> webhook |
| `sim-config` | Show current sim config | GET sim-api |
| `graph-send <platform> <psid> <text>` | Send DM as business | POST graph-api |
| `graph-mark-seen <platform> <psid>` | Send read receipt | POST graph-api |
| `graph-conversations [platform]` | List conversations via Graph API | GET graph-api |
| `graph-messages <conv_id> [limit]` | Get messages for a conversation | GET graph-api |
| `webhook '<json>'` | POST a raw signed webhook payload (auto HMAC) | POST webhook |

## Output format

Each call prints:

```
---- REQUEST ----
POST https://.../functions/v1/sim-api/sim/send
Body: {"psid":"psid-abc123","text":"hello"}

---- RESPONSE ----
HTTP/2 200
content-type: application/json

{
    "success": true,
    "messageId": "m_abc123...",
    "webhookResult": { "success": true, "status": 200 }
}
```

## Already available (no script needed)

- **DB inspection**: `execute_sql` via Supabase MCP -- query messages, conversation_reads, sim_messages, sim_conversations, etc.
- **Edge function logs**: `get_logs` via Supabase MCP -- see execution output/errors
- **Webhook signing**: `openssl dgst -sha256 -hmac` for raw webhook tests

## End-to-end test flows

1. **Inbound message**: `sim-send` -> check `get_logs` for webhook execution -> `execute_sql` to verify DB state -> confirm broadcast worked
2. **Read receipt**: `graph-mark-seen` -> `execute_sql` to check `sim_conversations.read_watermark` updated
3. **Outbound DM**: `graph-send` -> `execute_sql` to verify `sim_messages` has the echo
4. **Full roundtrip**: `sim-send` -> wait -> `graph-send` reply -> `graph-mark-seen` -> verify all DB tables

## Key values (from sim_config)

- Supabase URL: from .env VITE_SUPABASE_URL
- Edge function base: `{SUPABASE_URL}/functions/v1/`
- access_token: `SIM_ACCESS_TOKEN_DEV`
- page_id: `111222333444555`
- ig_user_id: `999888777666555`
- app_secret: `inkbloop-dev-secret`
- webhook_url: `{SUPABASE_URL}/functions/v1/webhook`
