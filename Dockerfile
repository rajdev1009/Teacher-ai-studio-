FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Clean up any extensionless or misnamed files from AI Studio format
RUN rm -f App vite_config.ts server 2>/dev/null || true
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
