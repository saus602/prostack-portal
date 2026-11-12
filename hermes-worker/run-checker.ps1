# Runs a ProStack checker against the local Qwen3 server. Asks for your staff login; nothing is saved.
# Usage:  .\run-checker.ps1            (dry run of checker.mjs, 3 cards)
#         .\run-checker.ps1 -Script rules-checker.mjs
#         .\run-checker.ps1 -Live      (files proposals for staff review)
param([string]$Script = 'checker.mjs', [switch]$Live, [int]$Max = 3)
$ErrorActionPreference = 'Stop'
$env:HERMES_URL = 'http://localhost:18434/v1'
$env:HERMES_MODEL = 'Qwen3-4B-Instruct-2507-Q4_K_M'
$env:HERMES_API_KEY_FILE = 'D:\HermesRuntime\Keys\inference.key'
$env:DRY_RUN = $(if ($Live) { '0' } else { '1' })
$env:MAX_CARDS = "$Max"
$env:PROSTACK_STAFF_EMAIL = Read-Host 'Staff email'
$secure = Read-Host 'Staff password' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:PROSTACK_STAFF_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  node (Join-Path $PSScriptRoot $Script)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:PROSTACK_STAFF_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:HERMES_API_KEY -ErrorAction SilentlyContinue
}
