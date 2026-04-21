FROM node:20-alpine

WORKDIR /app

# Kopier hele repo-et inn
COPY . .

# Installer backend-avhengigheter
RUN cd backend && npm install --omit=dev

# Railway setter PORT selv; vår server.js leser process.env.PORT
EXPOSE 3001

CMD ["node", "backend/server.js"]
