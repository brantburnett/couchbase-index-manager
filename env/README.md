# Testing Environments

This folder contains Docker Compose files that help to create
testing environments.

## Starting the Environment

```powershell
./env/Up.ps1 4.6.4
```

For an image other than Enterprise from the "couchbase" registry:

```powershell
./env/Up.ps1 couchbase/server:5.5.0-Mar
```

## Running couchbase-index-manager

If another shell window:

```powershell
./env/Exec.ps1 sync beer-sample ./beer-sample
```

## Stopping the Environment

First, press CTRL+C to stop the containers, then:

```powershell
./env/Down.ps1 4.6.4
```
