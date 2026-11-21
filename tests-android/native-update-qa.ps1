param(
    [Parameter(Mandatory)][string]$Serial,
    [Parameter(Mandatory)][string]$QaDirectory,
    [switch]$Formal,
    [Parameter(Mandatory)][ValidateSet('FormalBaseline', 'Baseline', 'Upgrade', 'First', 'ResumeFirst', 'Second', 'Failures', 'Rollback', 'Offline', 'Manual', 'GitHubBaseline', 'GitHubUpgrade', 'GitHubFirst', 'GitHubInterrupt', 'GitHubSecond', 'GitHubRollback', 'GitHubOffline', 'GitHubManual')][string]$Step
)
$ErrorActionPreference = 'Stop'
if ($Serial -notmatch '^emulator-\d+$') { throw 'Use a disposable emulator.' }
$QaDirectory = (Resolve-Path -LiteralPath $QaDirectory).Path
$app = if ($Formal) { 'com.littledays.app' } else { 'com.littledays.capacitorexperiment' }
$activity = "$app/com.littledays.app.MainActivity"
$downloads = '/sdcard/Download'
$shell = if ($Formal) { 2 } elseif ($Step -like 'GitHub*') { 5 } else { 4 }

function Invoke-Adb {
    & adb -s $Serial @args
    if ($LASTEXITCODE -ne 0) { throw "adb failed: $($args[0])" }
}

function Find-Element([string]$pattern, [int]$attempts = 14) {
    for ($attempt = 0; $attempt -lt $attempts; $attempt++) {
        $dump = & adb -s $Serial shell uiautomator dump /sdcard/cozy-surface.xml 2>$null
        if ($LASTEXITCODE -eq 0 -and $dump -match 'dumped to') {
            Invoke-Adb pull /sdcard/cozy-surface.xml "$QaDirectory/surface.xml" | Out-Null
            $xml = [xml](Get-Content -LiteralPath "$QaDirectory/surface.xml" -Raw -Encoding utf8)
            $element = $xml.SelectNodes('//node') | Where-Object {
                $_.class -notmatch 'EditText|AutoCompleteTextView' -and ($_.text -match $pattern -or $_.'content-desc' -match $pattern)
            } | Select-Object -First 1
            if ($element) { return $element }
            if ($xml.SelectSingleNode('//node[contains(@text,"isn''t responding")]')) {
                $wait = $xml.SelectSingleNode('//node[@text="Wait"]')
                if ($wait) { Tap-Element $wait }
            }
        }
        Start-Sleep -Milliseconds 400
    }
}

function Require-Element([string]$pattern) {
    $element = Find-Element $pattern
    if (!$element) { throw "Missing UI element: $pattern" }
    $element
}

function Tap-Element($element) {
    $bounds = [regex]::Matches($element.bounds, '\d+') | ForEach-Object { [int]$_.Value }
    Invoke-Adb shell input tap ([int](($bounds[0] + $bounds[2]) / 2)) ([int](($bounds[1] + $bounds[3]) / 2))
    Start-Sleep -Milliseconds 350
}

function Touch([string]$pattern) {
    Tap-Element (Require-Element $pattern)
}

function Cold-Start {
    Invoke-Adb shell am force-stop $app
    Invoke-Adb shell am start -W -n $activity | Out-Null
    Require-Element '^打开应用设置$' | Out-Null
}

function Pick-Download([string]$filename) {
    $pattern = '^' + [regex]::Escape($filename) + '$'
    if (Find-Element '^Files$' 1) { Touch '^Files$' }
    if (!(Find-Element $pattern 1)) {
        Touch '^Show roots$'
        Touch '^Downloads$'
    }
    if (!(Find-Element $pattern 1)) {
        Touch '^Show roots$'
        Touch '^Android SDK built for x86_64$'
        Touch '^Download$'
    }
    if (!(Find-Element $pattern 1) -and (Find-Element '^List view$' 1)) { Touch '^List view$' }
    if (!(Find-Element $pattern 1) -and (Find-Element '^Search$' 1)) {
        Touch '^Search$'
        Invoke-Adb shell input text $filename
        Invoke-Adb shell input keyevent 66
    }
    Touch $pattern
}

function Open-Backup {
    Touch '^打开应用设置$'
    Touch '^数据备份与恢复$'
}

function Export-Records([string]$snapshot) {
    Open-Backup
    Touch '导出完整 JSON'
    if (Find-Element '^Show roots$' 1) {
        Touch '^Show roots$'
        Touch '^Downloads$'
    }
    Touch '^(Save|保存)$'
    Require-Element '已保存备份' | Out-Null
    $names = Invoke-Adb shell "ls $downloads/cozy-days-*.json"
    $latest = $names | Sort-Object | Select-Object -Last 1
    if (!$latest) { throw 'No exported backup found' }
    Invoke-Adb pull $latest "$QaDirectory/$snapshot.json" | Out-Null
    Touch '^返回设置$'
    Touch '^返回上一页$'
}

function Compare-Records([string]$snapshot) {
    Export-Records $snapshot
    $before = Get-Content -LiteralPath "$QaDirectory/baseline.json" -Raw | ConvertFrom-Json -AsHashtable
    $after = Get-Content -LiteralPath "$QaDirectory/$snapshot.json" -Raw | ConvertFrom-Json -AsHashtable
    if (($before.records | ConvertTo-Json -Depth 60 -Compress) -cne ($after.records | ConvertTo-Json -Depth 60 -Compress)) {
        throw "Stored records changed: $snapshot"
    }
}

function Set-Release([int]$revision, [string]$mode = 'normal') {
    Set-Content -LiteralPath "$QaDirectory/releases/scenario.json" -Encoding utf8NoBOM -Value (@{ web = $revision; mode = $mode } | ConvertTo-Json -Compress)
}

function Require-Version([int]$revision) {
    Touch '^打开应用设置$'
    Require-Element "当前网页版本 $revision · 外壳 $shell" | Out-Null
    Touch '^返回上一页$'
}

function Offer-Release([int]$revision, [string]$mode = 'normal') {
    Set-Release $revision $mode
    Touch '^打开应用设置$'
    Touch '^检查更新$'
    Require-Element '发现新版本' | Out-Null
    Touch '^立即更新$'
}

function Finish-Release([int]$revision) {
    Require-Element '更新完成！！！' | Out-Null
    Require-Element "^当前网页版本 $revision$" | Out-Null
    Touch '^关闭$'
    Require-Version $revision
}

function Capture-Progress([int]$revision) {
    for ($sample = 1; $sample -le 2; $sample++) {
        Start-Sleep -Seconds 2
        Invoke-Adb shell screencap -p /sdcard/cozy-progress.png
        Invoke-Adb pull /sdcard/cozy-progress.png "$QaDirectory/web-$revision-progress-$sample.png" | Out-Null
    }
}

function Open-GitHubRelease([int]$revision) {
    Touch '^打开应用设置$'
    Touch '^检查更新$'
    Require-Element "网页版本 $revision · " | Out-Null
}

function Import-TestBundle([int]$revision) {
    $filename = "local-web-$revision.cozyupdate"
    Invoke-Adb push "$QaDirectory/$filename" "$downloads/$filename" | Out-Null
    Touch '^打开应用设置$'
    Touch '^导入网页更新$'
    Pick-Download $filename
}

function Go-Offline {
    if ($Formal -and ((Invoke-Adb reverse --list) -match 'tcp:4489 tcp:4489')) {
        Invoke-Adb reverse --remove tcp:4489
    }
    Invoke-Adb shell svc wifi disable
    Invoke-Adb shell svc data disable
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        if ((Invoke-Adb shell dumpsys connectivity) -match 'Active default network: none') { return }
        Start-Sleep -Seconds 1
    }
    throw 'Emulator has an active network'
}

function Capture-Screen([string]$name) {
    Invoke-Adb shell screencap -p /sdcard/cozy-baseline.png | Out-Null
    Invoke-Adb pull /sdcard/cozy-baseline.png "$QaDirectory/$name.png" | Out-Null
}

function Enter-SeedText([string]$value) {
    Invoke-Adb shell input text $value
    if ((Invoke-Adb shell dumpsys input_method) -match 'mInputShown=true') {
        Invoke-Adb shell input keyevent 4
    }
}

switch ($Step) {
    'FormalBaseline' {
        if (!$Formal) { throw 'FormalBaseline requires -Formal' }
        if (!((Invoke-Adb shell dumpsys package $app) -match 'versionCode=1\b')) { throw 'Install the archived formal version 1 first' }
        Touch '^新增待办$'
        Enter-SeedText 'FormalUpgradeTodoQA'
        Touch '^保存$'
        Require-Element 'FormalUpgradeTodoQA' | Out-Null
        Touch '^纪念日$'
        Touch '^新增纪念日$'
        Enter-SeedText 'FormalUpgradeAnniversaryQA'
        Touch '^保存纪念日$'
        Require-Element 'FormalUpgradeAnniversaryQA' | Out-Null
        Touch '^生理期$'
        Touch '^记录第一次经期$'
        Touch '^保存经期记录$'
        Require-Element '当前周期' | Out-Null
        Touch '^适中$'
        Invoke-Adb shell am force-stop $app
        Invoke-Adb shell am start -W -n $activity | Out-Null
        Require-Element 'FormalUpgradeTodoQA' | Out-Null
        Capture-Screen 'formal-v1-todo'
        Touch '^纪念日$'
        Require-Element 'FormalUpgradeAnniversaryQA' | Out-Null
        Capture-Screen 'formal-v1-anniversary'
        Touch '^生理期$'
        Require-Element '历史经期|当前周期' | Out-Null
        if (Find-Element '^记录第一次经期$' 1) { throw 'Legacy period did not persist' }
        Capture-Screen 'formal-v1-period'
        Invoke-Adb shell date '+%F' | Set-Content "$QaDirectory/seed-date.txt"
    }
    'Baseline' {
        Invoke-Adb install -r "$QaDirectory/baseline.apk"
        Cold-Start
        Invoke-Adb push "$QaDirectory/seed.json" "$downloads/cozy-fixture-seed.json" | Out-Null
        Open-Backup
        Touch '选择备份文件'
        Pick-Download 'cozy-fixture-seed.json'
        $size = Invoke-Adb shell wm size | Select-Object -Last 1
        $size -match '(\d+)x(\d+)' | Out-Null
        $midX = [int]([int]$Matches[1] / 2)
        $height = [int]$Matches[2]
        Invoke-Adb shell input swipe $midX ([int]($height * .77)) $midX ([int]($height * .38)) 350
        Touch '^确认合并$'
        Touch '^重新打开应用$'
        Require-Element '^打开应用设置$' | Out-Null
        Export-Records 'baseline'
        $baseline = Get-Content -LiteralPath "$QaDirectory/baseline.json" -Raw | ConvertFrom-Json
        if ($baseline.records.todos.Count -ne 1 -or $baseline.records.anniversaries.Count -ne 1 -or
            $baseline.records.period.periods.Count -ne 1 -or !$baseline.records.period.days) { throw 'Seed data is incomplete' }
    }
    'Upgrade' {
        Set-Release 0
        $apk = if ($Formal) { 'Cozy-Days-Android-0.2.2-2.apk' } else { 'Cozy-Days-Android-Experiment-0.2.1-4.apk' }
        Invoke-Adb install -r "$QaDirectory/$apk"
        Cold-Start
        Require-Version 1
        if ($Formal) {
            Export-Records 'after-apk'
            $records=(Get-Content "$QaDirectory/after-apk.json" -Raw | ConvertFrom-Json).records
            $date=(Get-Content "$QaDirectory/seed-date.txt").Trim()
            if ($records.todos.Count -ne 1 -or $records.todos[0].text -cne 'FormalUpgradeTodoQA' -or $records.todos[0].date -cne $date -or
                $records.anniversaries.Count -ne 1 -or $records.anniversaries[0].name -cne 'FormalUpgradeAnniversaryQA' -or $records.anniversaries[0].date -cne $date -or
                $records.period.periods.Count -ne 1 -or $records.period.periods[0].start -cne $date -or
                $records.period.days.$date.flow -cne '适中') {
                throw 'The records saved in the formal version 1 did not survive the APK update'
            }
            Copy-Item -LiteralPath "$QaDirectory/after-apk.json" -Destination "$QaDirectory/baseline.json"
        } else {
            Compare-Records 'after-apk'
        }
    }
    'First' {
        Set-Release 2
        Cold-Start
        Touch '^立即更新$'
        Capture-Progress 2
        Finish-Release 2
        Compare-Records 'after-web2'
    }
    'ResumeFirst' {
        Finish-Release 2
        Compare-Records 'after-web2'
    }
    'Second' {
        Offer-Release 3
        Capture-Progress 3
        Finish-Release 3
        Compare-Records 'after-web3'
    }
    'Failures' {
        foreach ($test in @(@('cut', '下载未完成'), @('hash', 'SHA-256 校验失败'), @('signature', '签名与当前 APK 不匹配'))) {
            Offer-Release 4 $test[0]
            Require-Element $test[1] | Out-Null
            Require-Element '^重试下载$' | Out-Null
            Touch '^关闭$'
            Require-Element "当前网页版本 3 · 外壳 $shell" | Out-Null
            Touch '^返回上一页$'
        }
    }
    'Rollback' {
        Offer-Release 4
        Require-Element '新网页未能启动，已恢复稳定版本' | Out-Null
        Require-Element '^当前网页版本 3$' | Out-Null
        Touch '^关闭$'
        Require-Version 3
        Compare-Records 'after-rollback'
    }
    'Offline' {
        if ((Invoke-Adb reverse --list) -match 'tcp:4474 tcp:4474') { Invoke-Adb reverse --remove tcp:4474 }
        Go-Offline
        Cold-Start
        Require-Version 3
        Compare-Records 'offline'
    }
    'Manual' {
        if (!(Find-Element '^Files in Downloads?$' 1)) {
            Cold-Start
            Invoke-Adb push "$QaDirectory/manual-5.cozyupdate" "$downloads/manual-5.cozyupdate" | Out-Null
            Touch '^打开应用设置$'
            Touch '^导入网页更新$'
        }
        Pick-Download 'manual-5.cozyupdate'
        Finish-Release 5
        Compare-Records 'after-manual'
    }
    'GitHubBaseline' {
        Cold-Start
        Export-Records 'baseline'
        $baseline = Get-Content -LiteralPath "$QaDirectory/baseline.json" -Raw | ConvertFrom-Json
        if (!$baseline.records.todos.Count -or !$baseline.records.anniversaries.Count -or
            !$baseline.records.period.periods.Count -or !$baseline.records.period.days) {
            throw 'Synthetic baseline records are incomplete'
        }
    }
    'GitHubUpgrade' {
        Invoke-Adb install -r "$QaDirectory/Cozy-Days-Android-Experiment-0.2.1-5.apk"
        Cold-Start
        Touch '^打开应用设置$'
        Require-Element '当前网页版本 1 · 外壳 5' | Out-Null
        Require-Element '^当前已是最新版本。$' | Out-Null
        Touch '^返回上一页$'
        Compare-Records 'after-apk'
    }
    'GitHubFirst' {
        Touch '^打开应用设置$'
        Touch '^接收预发布网页更新$'
        Touch '^返回上一页$'
        Open-GitHubRelease 2
        Touch '^立即更新$'
        Capture-Progress 2
        Finish-Release 2
        Compare-Records 'after-web2'
    }
    'GitHubInterrupt' {
        if ($Formal) { Set-Release 3 'cut' }
        Open-GitHubRelease 3
        Touch '^立即更新$'
        Go-Offline
        Require-Element '下载未完成' | Out-Null
        Require-Element '^重试下载$' | Out-Null
        Touch '^关闭$'
        Cold-Start
        Require-Version 2
        Compare-Records 'after-interruption'
        Invoke-Adb shell svc wifi enable
        Invoke-Adb shell svc data enable
        if ($Formal) { Invoke-Adb reverse tcp:4489 tcp:4489 }
    }
    'GitHubSecond' {
        Open-GitHubRelease 3
        Touch '^立即更新$'
        Capture-Progress 3
        Finish-Release 3
        Compare-Records 'after-web3'
    }
    'GitHubRollback' {
        Cold-Start
        Import-TestBundle 4
        Require-Element '新网页未能启动，已恢复稳定版本' | Out-Null
        Require-Element '^当前网页版本 3$' | Out-Null
        Touch '^关闭$'
        Require-Version 3
        Compare-Records 'after-rollback'
    }
    'GitHubOffline' {
        Go-Offline
        Cold-Start
        Require-Version 3
        Compare-Records 'offline'
    }
    'GitHubManual' {
        Import-TestBundle 5
        Finish-Release 5
        Compare-Records 'after-manual'
    }
}
"PASS: $Step"
