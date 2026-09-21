FROM devlikeapro/waha:latest

# Use NOWEB engine (Baileys) - no Chromium needed, much lighter for free tier
ENV WHATSAPP_API_KEY=THISISMYSECURETOKEN
ENV WHATSAPP_DEFAULT_ENGINE=NOWEB
ENV WAHA_LOG_LEVEL=info

EXPOSE 3000
