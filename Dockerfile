# One image, two build systems, three stages.
#
# The split between what is baked in and what is supplied at runtime is the
# thing to get right here, and it is not symmetrical:
#
#   * VITE_* are inlined into the JavaScript bundle at BUILD time. They have to
#     be build args, and they are in the image forever. That is safe only
#     because they are the publishable key and the project URL — both public by
#     design. A `sb_secret_…` passed here would be readable by anyone who pulls
#     the image.
#   * Everything the API reads — the connection string above all — is read at
#     STARTUP from the environment. None of it belongs in a layer.

# ── 1. The SPA ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS spa
WORKDIR /src

# Dependencies first, so a source-only change doesn't re-run npm ci.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# Fails the build on a type error as well as a bundling one — `npm run build`
# is `tsc --noEmit && vite build`. Output lands in server/Tracksesh.Api/wwwroot.
RUN npm run build

# ── 2. The API ──────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src

COPY server/Tracksesh.Api/Tracksesh.Api.csproj server/Tracksesh.Api/
RUN dotnet restore server/Tracksesh.Api/Tracksesh.Api.csproj

COPY server/Tracksesh.Api/ server/Tracksesh.Api/

# The SPA, from the stage above rather than from the host — the .dockerignore
# excludes wwwroot precisely so a stale local build can't end up shipped.
COPY --from=spa /src/server/Tracksesh.Api/wwwroot server/Tracksesh.Api/wwwroot

RUN dotnet publish server/Tracksesh.Api/Tracksesh.Api.csproj -c Release -o /app --no-restore

# ── 3. Runtime ──────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

COPY --from=api /app .

# 8080 because the image runs as a non-root user, which cannot bind 80.
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true

EXPOSE 8080

# Provided by the base image since .NET 8. Running as root inside a container
# is a needless extra step for anything that gets code execution.
USER $APP_UID

ENTRYPOINT ["dotnet", "Tracksesh.Api.dll"]
