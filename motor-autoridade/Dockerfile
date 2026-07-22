FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build Next.js
RUN npm run build

# Remove devDependencies for production
RUN npm prune --omit=dev

EXPOSE 3000

ENV NODE_ENV=production
CMD ["npm", "run", "start"]
