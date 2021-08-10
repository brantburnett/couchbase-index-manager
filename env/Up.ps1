Param(
    [string]
    [Parameter(Position=0)]
    $Version = "6.5.1"
)

if ($Version -match "^(\d+\.)*\d+$") {
    $env:CBIMAGE = "couchbase:enterprise-$Version"
} else {
    $env:CBIMAGE = $Version
}

docker-compose -p cbindexmgr -f $PSScriptRoot\docker-compose.yaml up
