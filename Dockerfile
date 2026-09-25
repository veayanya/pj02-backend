FROM node:20-slim

# System conversion tools: LibreOffice (docx/pptx/pdf), Pandoc (docx/html/epub),
# Tesseract OCR + Poppler (scanned PDF -> text).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    pandoc \
    tesseract-ocr \
    poppler-utils \
    fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/server.js"]
