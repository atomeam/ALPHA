# ALPHA bridge

`atomeam/atomarcade-bridge` is connected through ALPHA's provider registry and backend readiness endpoints. The upstream PowerShell runtime is not copied or executed here yet because it contains local worker loops; migrate it behind `packages/permissions` before enabling command execution.
