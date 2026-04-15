# Docker

## Build

```bash
docker build -t autopilot .
```

## Run

```bash
docker run -p 3100:3100 \
  -v ./autopilot.toml:/etc/autopilot/config.toml \
  -e AWS_ACCESS_KEY_ID=xxx \
  -e AWS_SECRET_ACCESS_KEY=xxx \
  autopilot
```

## Docker Compose

```yaml
version: '3.8'
services:
  autopilot:
    build: .
    ports:
      - '3100:3100'
    volumes:
      - ./autopilot.toml:/etc/autopilot/config.toml
    environment:
      - AWS_ACCESS_KEY_ID
      - AWS_SECRET_ACCESS_KEY
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: autopilot
      POSTGRES_PASSWORD: autopilot
      POSTGRES_DB: autopilot
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - '5432:5432'

volumes:
  pgdata:
```

```bash
docker compose up -d
curl http://localhost:3100/health
```

## Environment-Only Config

Skip the TOML file and use env vars:

```bash
docker run -p 3100:3100 \
  -e DATABASE_URL=postgresql://autopilot:autopilot@host.docker.internal:5432/autopilot \
  -e SES_REGION=us-east-1 \
  -e DOMAIN=mail.myapp.com \
  -e API_KEYS=my-secret-key \
  autopilot
```
