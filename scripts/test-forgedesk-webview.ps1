param(
    [int]$Port = 9222,
    [string]$ScreenshotPath = "$env:TEMP\forgedesk-webview-test.png"
)

$ErrorActionPreference = "Stop"
$target = Invoke-RestMethod "http://127.0.0.1:$Port/json" |
    Where-Object { $_.type -eq "page" -and $_.title -eq "ForgeDesk" } |
    Select-Object -First 1

if (-not $target) {
    throw "ForgeDesk WebView debug target was not found"
}

$socket = [System.Net.WebSockets.ClientWebSocket]::new()
$cancellation = [System.Threading.CancellationToken]::None
$null = $socket.ConnectAsync(
    [Uri]$target.webSocketDebuggerUrl,
    $cancellation
).GetAwaiter().GetResult()
$script:requestId = 0
$script:events = [System.Collections.Generic.List[object]]::new()

function Receive-CdpMessage {
    $buffer = New-Object byte[] 1048576
    $segment = [ArraySegment[byte]]::new($buffer)
    $stream = [System.IO.MemoryStream]::new()
    do {
        $result = $socket.ReceiveAsync($segment, $cancellation).GetAwaiter().GetResult()
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw "CDP WebSocket was closed"
        }
        $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
}

function Send-Cdp {
    param(
        [Parameter(Mandatory)] [string]$Method,
        [hashtable]$Params = @{}
    )
    $script:requestId++
    $id = $script:requestId
    $payload = @{
        id = $id
        method = $Method
        params = $Params
    } | ConvertTo-Json -Depth 100 -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    $null = $socket.SendAsync(
        $segment,
        [System.Net.WebSockets.WebSocketMessageType]::Text,
        $true,
        $cancellation
    ).GetAwaiter().GetResult()

    while ($true) {
        $message = Receive-CdpMessage
        if ($message.id -eq $id) {
            if ($message.error) {
                throw ($message.error | ConvertTo-Json -Depth 20 -Compress)
            }
            return $message.result
        }
        if ($message.method) {
            $script:events.Add($message)
        }
    }
}

function Invoke-JavaScript {
    param([Parameter(Mandatory)] [string]$Expression)
    $response = Send-Cdp -Method "Runtime.evaluate" -Params @{
        expression = $Expression
        returnByValue = $true
        awaitPromise = $true
    }
    if ($response.exceptionDetails) {
        throw ($response.exceptionDetails | ConvertTo-Json -Depth 20 -Compress)
    }
    $response.result.value
}

try {
    Send-Cdp -Method "Runtime.enable" | Out-Null
    Send-Cdp -Method "Page.enable" | Out-Null

    $before = Invoke-JavaScript @'
(() => ({
  title: document.title,
  bodyText: document.body.innerText.slice(0, 600),
  threadButtons: [...document.querySelectorAll(".thread-button")].slice(0, 5).map((node, index) => ({
    index,
    text: node.innerText,
    rect: node.getBoundingClientRect().toJSON()
  })),
  conversationPane: document.querySelector(".conversation-pane")?.getBoundingClientRect().toJSON(),
  threadView: document.querySelector(".thread-view")?.getBoundingClientRect().toJSON(),
  composer: document.querySelector(".composer-wrap")?.getBoundingClientRect().toJSON(),
  inspector: document.querySelector(".inspector")?.getBoundingClientRect().toJSON()
}))()
'@

    $clicked = Invoke-JavaScript @'
(() => {
  const button = document.querySelector(".thread-button");
  if (!button) return false;
  button.click();
  return true;
})()
'@

    Start-Sleep -Seconds 5

    $after = Invoke-JavaScript @'
(() => ({
  bodyText: document.body.innerText.slice(0, 1200),
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    bodyScrollHeight: document.body.scrollHeight,
    rootScrollHeight: document.documentElement.scrollHeight
  },
  activeTitle: document.querySelector(".workspace-heading h1")?.textContent,
  loading: document.querySelector(".history-loading")?.textContent,
  itemCount: document.querySelectorAll(".message-row, .collapsible-item, .compact-event").length,
  messageRows: document.querySelectorAll(".message-row").length,
  threadView: document.querySelector(".thread-view")?.getBoundingClientRect().toJSON(),
  historyText: document.querySelector(".history-list")?.innerText.slice(0, 1600),
  composer: document.querySelector(".composer-wrap")?.getBoundingClientRect().toJSON(),
  inspector: document.querySelector(".inspector")?.getBoundingClientRect().toJSON()
}))()
'@

    $capture = Send-Cdp -Method "Page.captureScreenshot" -Params @{
        format = "png"
        fromSurface = $true
    }
    [IO.File]::WriteAllBytes($ScreenshotPath, [Convert]::FromBase64String($capture.data))

    $errors = $script:events |
        Where-Object { $_.method -in @("Runtime.exceptionThrown", "Log.entryAdded") } |
        ForEach-Object { $_.params }

    [pscustomobject]@{
        TargetUrl = $target.url
        Clicked = $clicked
        Before = $before
        After = $after
        Errors = @($errors)
        ScreenshotPath = $ScreenshotPath
    } | ConvertTo-Json -Depth 100
}
finally {
    $socket.Dispose()
}
