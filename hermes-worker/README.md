# ProStack catalog checker (local Hermes)

Runs on your Windows PC. It reads each card's source page, asks your **local Hermes model** whether the
terms changed, and files a *proposal*. Nothing changes in the live catalog until a staff member approves it
in the portal's Staff tab. It will not run if `HERMES_URL` points outside this computer or your own network (localhost, 192.168.x.x, 10.x.x.x, or a machine name like ALIENWARE).

## One-time setup
1. Install Node 18 or newer.
2. Make sure Hermes is serving (on another PC, e.g. `http://192.168.1.50:11434/v1`; for Ollama set `OLLAMA_HOST=0.0.0.0` on that PC and allow port 11434 in its Windows firewall) an OpenAI-style API on this PC. For Ollama that is `http://localhost:11434/v1`.
   Set `HERMES_MODEL` to the exact model name (run `ollama list` to see it).
3. Use a **staff login** for the portal (an analyst account is enough).

## Run (PowerShell)
```
$env:PROSTACK_STAFF_EMAIL = "you@example.com"
$env:PROSTACK_STAFF_PASSWORD = "your password"
$env:HERMES_URL = "http://localhost:11434/v1"
$env:HERMES_MODEL = "hermes3"
node checker.mjs
```
Add `$env:DRY_RUN = "1"` to preview without filing anything. `MAX_CARDS` (default 10) limits each run.

## Notes
- Credentials stay in your own PowerShell session; do not save them in files.
- Proposals can only touch fee, intro months, APR, rewards and welcome offer. Staff approve or reject each one.
- Page text is sent only to Hermes on this computer. No cloud AI is called.
- Local models can misread pages. Always read the evidence quote before approving.

## Checking issuer rules (not just cards)

`node rules-checker.mjs` works the same way as `checker.mjs`, but for issuer rules that have not been verified in 60 days. Hermes reads each rule's source page and either says it is still current or proposes new terms. Nothing changes until staff press Approve, Still current or Reject on the Staff tab. Same environment variables as above; `DRY_RUN=1` shows what it would file.
