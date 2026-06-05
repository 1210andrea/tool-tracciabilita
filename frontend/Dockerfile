FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . ./
RUN if [ -d node_modules/.bin ]; then chmod -R a+rx node_modules/.bin; fi
# Use npx to invoke vite directly to avoid permission issues with bin wrappers
RUN npx vite build
EXPOSE 3000
CMD ["npm","run","preview","--","--host","0.0.0.0","--port","3000"]

