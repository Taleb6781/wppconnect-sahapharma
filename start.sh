#!/bin/sh
set -e

# Save Render public port
export PUBLIC_PORT=${PORT:-3000}

# Start reverse proxy server listening on PUBLIC_PORT
node /server-proxy.js &

# Configure WAHA to listen strictly on internal port 3001
export PORT=3001
export WHATSAPP_API_PORT=3001

# Execute WAHA main entrypoint
exec /entrypoint.sh
