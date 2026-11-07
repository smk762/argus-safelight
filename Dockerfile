FROM node:22-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
# Baked in: the browser calls darkroom at this URL.
ARG NEXT_PUBLIC_DARKROOM_URL=http://localhost:8106
ENV NEXT_PUBLIC_DARKROOM_URL=$NEXT_PUBLIC_DARKROOM_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# The port next listens on; compose publishes the same number so the logs match the URL.
ENV PORT=3097
COPY --from=build /app ./
EXPOSE 3097
CMD ["npm", "start"]
