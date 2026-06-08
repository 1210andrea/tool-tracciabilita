FROM node:20-alpine
WORKDIR /app

# Install pulito (evita residui da build precedenti)
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

# Build TypeScript (senza prisma generate)
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "run", "start"]


