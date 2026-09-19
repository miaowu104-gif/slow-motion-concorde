# ============================================================
# shots.ps1 —— 用 headless Chrome 逐段截图，供人工核对
# 用法: pwsh -File tools/shots.ps1
# ============================================================
$ErrorActionPreference = 'Continue'

$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) {
  $chrome = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
}
$proj  = 'E:\deepseek\slow-motion-concorde\slow-motion-animation-v2'
$shots = Join-Path $proj 'shots'
if (-not (Test-Path $shots)) { New-Item -ItemType Directory -Path $shots -Force | Out-Null }
$prof = Join-Path $env:TEMP 'sm-chrome-profile'
if (-not (Test-Path $prof)) { New-Item -ItemType Directory -Path $prof -Force | Out-Null }

# 覆盖 11 个段落 + 24 块画板中的代表点
$list = @(
  @{ t = 20000;  n = '01_intro_20s' },
  @{ t = 38000;  n = '02_intro_38s' },
  @{ t = 46500;  n = '03_eclipse_46s5' },
  @{ t = 52000;  n = '04_buildup_52s' },
  @{ t = 58000;  n = '05_g0l0_eyes' },
  @{ t = 63000;  n = '06_g0l1_crowd' },
  @{ t = 68000;  n = '07_g0l2_light' },
  @{ t = 72000;  n = '08_g0l3_ruler' },
  @{ t = 80000;  n = '09_interlude_flight' },
  @{ t = 95000;  n = '10_g1l0_altitude' },
  @{ t = 104000; n = '11_g1l2_clouds' },
  @{ t = 115000; n = '12_g2l0_bare' },
  @{ t = 122000; n = '13_g2l2_blocked' },
  @{ t = 130500; n = '14_breath' },
  @{ t = 134000; n = '15_g3l0_shadow' },
  @{ t = 143000; n = '16_g3l2_rays' },
  @{ t = 153000; n = '17_g4l0_orbit' },
  @{ t = 162000; n = '18_g4l2_arc' },
  @{ t = 172000; n = '19_g5l0_sun' },
  @{ t = 185000; n = '20_g5l3_final' },
  # 第 2 版特有的画面：俯瞰月影 + 结尾标语。21/22/24 用 1680x1050（16:10）
  @{ t = 8000;   n = '21_sunshadow_early';   w = 1680; h = 1050 },
  @{ t = 30000;  n = '22_sunshadow_mid';     w = 1680; h = 1050 },
  @{ t = 79000;  n = '23_concorde_on_trail'; w = 1600; h = 900 },
  @{ t = 191500; n = '24_end_slogan';        w = 1680; h = 1050 }
)

$ok = 0; $bad = @()
$errFile = Join-Path $env:TEMP 'sm-chrome-err.txt'
$outFile = Join-Path $env:TEMP 'sm-chrome-out.txt'
foreach ($it in $list) {
  $out = Join-Path $shots ($it.n + '.png')
  if (Test-Path $out) { Remove-Item $out -Force }
  $url = "file:///E:/deepseek/slow-motion-concorde/slow-motion-animation-v2/index.html?t=$($it.t)"
  $cw = if ($it.w) { $it.w } else { 1600 }
  $ch = if ($it.h) { $it.h } else { 900 }
  $argList = @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    "--user-data-dir=$prof", "--window-size=$cw,$ch",
    '--virtual-time-budget=2500', "--screenshot=$out", $url
  )
  Start-Process -FilePath $chrome -ArgumentList $argList -Wait -NoNewWindow `
                -RedirectStandardError $errFile -RedirectStandardOutput $outFile
  if (Test-Path $out) {
    $kb = [math]::Round((Get-Item $out).Length / 1024)
    Write-Host ("  OK  {0,-22} t={1,-7} {2} KB" -f $it.n, $it.t, $kb)
    $ok++
  } else {
    Write-Host ("  FAIL {0} t={1}" -f $it.n, $it.t)
    $bad += $it.n
  }
}
Write-Host ""
Write-Host ("shots done: {0}/{1}" -f $ok, $list.Count)
if ($bad.Count) { Write-Host ("failed: " + ($bad -join ', ')) }

