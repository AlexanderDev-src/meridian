# Installs Meridian on Windows, or updates it when a newer release exists. Safe to run again.
# Wrapped in a function so a cut-off download does nothing and errors never close the terminal.
function Install-Meridian {
    $ErrorActionPreference = "Stop"
    $ProgressPreference = "SilentlyContinue"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $repo = "AlexanderDev-src/meridian"
    $asset = "Meridian-windows-x64-setup.exe"
    if (-not [Environment]::Is64BitOperatingSystem) { throw "Meridian needs 64-bit Windows." }

    $app = Join-Path $env:LOCALAPPDATA "Meridian\meridian.exe"
    $stateDir = Join-Path $env:LOCALAPPDATA "MeridianInstaller"
    $versionFile = Join-Path $stateDir "version"

    $tag = (Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest").tag_name
    if ($tag -notmatch '^v\d+\.\d+\.\d+$') { throw "Could not find the latest release." }

    if ((Test-Path $app) -and (Test-Path $versionFile) -and ((Get-Content $versionFile -Raw).Trim() -eq $tag)) {
        Write-Host "Meridian $tag is already up to date."
        return
    }
    if (Get-Process -Name meridian -ErrorAction SilentlyContinue) {
        throw "Please close Meridian, then run this command again. A flight in progress is saved."
    }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("meridian-" + [Guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        $base = "https://github.com/$repo/releases/download/$tag"
        $setup = Join-Path $tmp $asset
        Write-Host "Downloading Meridian $tag..."
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile $setup
        $expected = ((Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset.sha256").Content | ForEach-Object {
            if ($_ -is [byte[]]) { [Text.Encoding]::ASCII.GetString($_) } else { $_ }
        }).Trim().Split(" ")[0]
        $actual = (Get-FileHash -Algorithm SHA256 -Path $setup).Hash
        if ($actual -ine $expected) { throw "Checksum failed, nothing was changed." }

        $process = Start-Process -FilePath $setup -ArgumentList "/S" -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "The installer failed with code $($process.ExitCode)." }
        if (-not (Test-Path $app)) { throw "The installer finished, but Meridian was not found." }

        New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
        Set-Content -Path $versionFile -Value $tag -Encoding ASCII
        Write-Host "Meridian $tag is installed. Open it from the Start menu."
    }
    finally {
        Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
    }
}

Install-Meridian
