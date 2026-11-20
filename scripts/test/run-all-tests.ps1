# scripts/test/run-all-tests.ps1
# Holistic Automated Test Suite Runner for TNL Website
# Guardrail: Zero production database mutation, in-memory mock DB only.

$ErrorActionPreference = "Stop"

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "  HOLISTIC TEST RUNNER - TNL WEBSITE (labtnl.site)" -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan

# 1. Backend Pytest Suite
Write-Host ">>> [1/4] Running Backend Unit & Integration Tests (pytest)..." -ForegroundColor Yellow
python -m pytest backend/tests -v --cov=backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Backend tests failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "[SUCCESS] Backend test suite passed 100%!" -ForegroundColor Green

# 2. Frontend Vitest Suite
Write-Host "`n>>> [2/4] Running Frontend Component & Layout Tests (Vitest)..." -ForegroundColor Yellow
Push-Location frontend
npx vitest run
$vitestExit = $LASTEXITCODE
Pop-Location
if ($vitestExit -ne 0) {
    Write-Host "[ERROR] Frontend tests failed!" -ForegroundColor Red
    exit $vitestExit
}
Write-Host "[SUCCESS] Frontend test suite passed 100%!" -ForegroundColor Green

# 3. Frontend TypeScript & Production Build
Write-Host "`n>>> [3/4] Running Frontend Typecheck & Build Verification..." -ForegroundColor Yellow
Push-Location frontend
npm run typecheck
$tcExit = $LASTEXITCODE
if ($tcExit -ne 0) {
    Pop-Location
    Write-Host "[ERROR] Typecheck failed!" -ForegroundColor Red
    exit $tcExit
}
npm run build
$buildExit = $LASTEXITCODE
Pop-Location
if ($buildExit -ne 0) {
    Write-Host "[ERROR] Frontend build failed!" -ForegroundColor Red
    exit $buildExit
}
Write-Host "[SUCCESS] Frontend typecheck & build passed 100%!" -ForegroundColor Green

# 4. E2E Playwright Read-Only Smoke Test
Write-Host "`n>>> [4/4] Running Live E2E Read-Only Smoke Tests (Playwright)..." -ForegroundColor Yellow
python -u scripts/test/run_e2e_smoke.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] E2E smoke tests failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host "[SUCCESS] Live E2E smoke test passed 100%!" -ForegroundColor Green

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "  ALL 4 TEST LAYERS PASSED PERFECTLY (100% VERIFIED)" -ForegroundColor Cyan
Write-Host "=======================================================`n" -ForegroundColor Cyan
