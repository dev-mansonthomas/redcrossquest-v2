FROM node:20-alpine AS build
ARG BUILD_CONFIGURATION
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN test -n "$BUILD_CONFIGURATION" || (echo "ERROR: BUILD_CONFIGURATION not set" && exit 1)
RUN npm run build -- --configuration=${BUILD_CONFIGURATION}

FROM nginx:alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

