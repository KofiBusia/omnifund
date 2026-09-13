FROM node:20-bullseye AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
COPY --from=frontend-build /app/dist ./dist

ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "gunicorn server:app --bind 0.0.0.0:${PORT}"]
