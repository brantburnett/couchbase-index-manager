@SETLOCAL
@SET PATHEXT=%PATHEXT:;.JS;=;%
@node  "%~dp0\couchbase-index-manager" %*
