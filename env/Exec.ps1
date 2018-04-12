# Executes couchbase-index-manager in a container with access to the test cluster
# with command line parameter passthrough
# Automatically includes authentication information for the test cluster
# and maps the example folder to /example in the container, set as the working dir

Param(
    [switch]
    $NoBuild,

    [string[]]
    [Parameter(ValueFromRemainingArguments=$true)]
    $Params
)

$effectiveParams = @(
    "-c", "couchbase://node1,node2,node3",
    "-u", "Administrator",
    "-p", "password"
)

$effectiveParams += $Params

if (-not $NoBuild) {
    docker build -t cbindexmgr-testexec $PSScriptRoot\..
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

$image = & docker inspect cbindexmgr_node1_1 -f '{{ index .Config.Labels \"com.centeredgesoftware.cbindexmgr.image\"}}'
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$version = [regex]::match($image,'((\d+\.){2}\d+)').Groups[1].Value
if ($version) {
    $versionNum = New-Object System.Version $version
    if ($versionNum.Major -lt 5) {
        $effectiveParams += @("--no-rbac")
    }
}

docker run -it --network cbindexmgr -v "$PSScriptRoot\..\example:/example:ro" -w /example cbindexmgr-testexec $effectiveParams
exit $LASTEXITCODE
