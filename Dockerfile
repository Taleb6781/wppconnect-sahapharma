FROM devlikeapro/waha:latest

# Use NOWEB engine (Baileys) - no Chromium needed, much lighter for free tier
ENV WHATSAPP_API_KEY=THISISMYSECURETOKEN
ENV WHATSAPP_DEFAULT_ENGINE=NOWEB
ENV WAHA_LOG_LEVEL=info
ENV WHATSAPP_API_PORT=3001

# Copy custom reverse proxy and startup script
COPY server-proxy.js /server-proxy.js
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000

CMD ["/start.sh"]
