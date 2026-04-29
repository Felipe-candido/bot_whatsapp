FROM node:20-slim
 
WORKDIR /app
 
# Instala dependências nativas do better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
 
COPY package*.json ./
RUN npm install
 
COPY . .
 
# Cria diretórios que serão montados como volumes
RUN mkdir -p /app/sessions /app/data /app/assets
 
EXPOSE 3000
 
CMD ["node", "index.js"]