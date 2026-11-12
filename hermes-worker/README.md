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

## Training the approval model (later)

Once 300+ outcomes exist per issuer, an admin exports them with `training_export()` and runs `python model/train.py outcomes.csv` locally. A model is saved only if it beats the plain approval rate on held-out outcomes and is not worse than the previous one. Until then the app keeps its rule-based labels.

## Using the Hermes worker gateway (model on a different PC)

If your model PC runs the locked "Hermes worker" gateway (HTTPS, one allowed computer, bearer token), run the checkers on the ALLOWED computer with:

```powershell
cd $HOME\ProStackChecker
# download checker.mjs, rules-checker.mjs and gateway.mjs from this folder first
$env:NODE_EXTRA_CA_CERTS = "C:\path\to\cert.pem"      # copy cert.pem (the public certificate) from the model PC
$env:HERMES_URL = "https://192.168.1.3:18458"         # the model PC's address and port, as in its config.json
$env:HERMES_GATEWAY_TOKEN = "<token from config.json>" # type it yourself; never paste it in chat
$env:PROSTACK_STAFF_EMAIL = "..."; $env:PROSTACK_STAFF_PASSWORD = "..."
$env:DRY_RUN = "1"; $env:MAX_CARDS = "3"
node checker.mjs
```

The gateway caps replies at 128 tokens and uses a small context window, so in this mode the checkers send only the sentences from each page that mention fees, rates, bonuses or rule terms. Keep MAX_CARDS small; it runs on the CPU.

## Using a local server on the Alienware (Qwen3 or similar)

If the model server on the Alienware speaks the OpenAI-style API (most do: llama.cpp server, LM Studio, vLLM, and Ollama's /v1), run the checkers on the Alienware itself and leave HERMES_GATEWAY_TOKEN unset:

```powershell
$env:HERMES_URL = "http://localhost:PORT/v1"     # or http://192.168.1.2:PORT/v1 from another PC
$env:HERMES_MODEL = "the-exact-model-name"       # whatever the server lists, for example a qwen3 name
```

The checkers strip any `<think>...</think>` reasoning before reading the answer. With a 64K context window the full page text is sent, not the short excerpts used for the gateway.
