# Usa uma versão leve do Node.js
FROM node:18-slim

# Cria a pasta do app
WORKDIR /app

# Copia apenas o package.json (o Docker não vai travar pela falta do lockfile aqui)
COPY package.json ./

# Instala as dependências
RUN npm install

# Copia o resto dos arquivos (seu index.js)
COPY . .

# Expõe a porta que configuramos no painel do Koyeb
EXPOSE 8000

# Comando para ligar o servidor
CMD ["node", "index.js"]
