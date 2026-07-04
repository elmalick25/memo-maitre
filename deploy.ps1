#!/usr/bin/env pwsh
# deploy.ps1 — Script de déploiement Firebase automatisé
# Usage: .\deploy.ps1
# Ce script garantit toujours : build PUIS deploy (jamais l'un sans l'autre)

param(
  [switch]$HostingOnly,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n🚀 Déploiement MemoMaster → Firebase" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# ── 1. Build ─────────────────────────────────────────────────────────────────
if (-not $SkipBuild) {
  Write-Host "`n📦 Build en cours (npm run build)..." -ForegroundColor Yellow
  Set-Location $RootDir
  npm run build
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build échoué ! Déploiement annulé." -ForegroundColor Red
    exit 1
  }
  Write-Host "✅ Build réussi !" -ForegroundColor Green
} else {
  Write-Host "⚠️  Build ignoré (--SkipBuild)" -ForegroundColor Yellow
}

# ── 2. Vérification du dist/ ──────────────────────────────────────────────────
$DistIndex = Join-Path $RootDir "dist\index.html"
if (-not (Test-Path $DistIndex)) {
  Write-Host "❌ dist/index.html introuvable ! Le build a peut-être échoué silencieusement." -ForegroundColor Red
  exit 1
}

$DistAge = (Get-Date) - (Get-Item $DistIndex).LastWriteTime
if ($DistAge.TotalMinutes -gt 10) {
  Write-Host "⚠️  AVERTISSEMENT : dist/index.html a plus de 10 minutes ($([int]$DistAge.TotalMinutes) min)" -ForegroundColor Yellow
  Write-Host "    Peut-être que le build n'a pas été regénéré ? Continuez ? (O/N)" -NoNewline
  $confirm = Read-Host " "
  if ($confirm -notmatch "^[Oo]") {
    Write-Host "Déploiement annulé." -ForegroundColor Red
    exit 0
  }
}

# ── 3. Afficher ce qui va être déployé ───────────────────────────────────────
Write-Host "`n📂 Contenu du dist/ à déployer :" -ForegroundColor Cyan
Get-ChildItem "$RootDir\dist" -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 10 | ForEach-Object {
  $age = (Get-Date) - $_.LastWriteTime
  Write-Host "   $($_.Name) — $([math]::Round($_.Length/1024, 1))KB — il y a $([int]$age.TotalMinutes)min" -ForegroundColor Gray
}

# ── 4. Firebase Deploy ────────────────────────────────────────────────────────
Write-Host "`n🔥 Déploiement sur Firebase..." -ForegroundColor Yellow

if ($HostingOnly) {
  firebase deploy --only hosting
} else {
  firebase deploy --only hosting,firestore:rules
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Déploiement Firebase échoué !" -ForegroundColor Red
  exit 1
}

Write-Host "`n✅ Déploiement réussi !" -ForegroundColor Green
Write-Host "🌐 Voir : https://memo-maitre.web.app/" -ForegroundColor Cyan
Write-Host "`n💡 Conseil : Attends 1-2 minutes puis force-refresh (Ctrl+Shift+R) pour vider le cache." -ForegroundColor DarkGray
