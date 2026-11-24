# landing: one image serves the page and the API on 8080 (ASP.NET's default).
# Runs as: (default) the site, `migrate` (EF Core migrations as the migrator role), `healthcheck`.

# 1. Page: React + Vite, built to static files
FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY src/Landing.Web/package.json src/Landing.Web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src/Landing.Web/ ./
RUN npm run build -- --outDir /web/dist

# 2. API: restore against the lock file, then publish with the page in wwwroot
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props ./
COPY src/Landing.Api/Landing.Api.csproj src/Landing.Api/packages.lock.json src/Landing.Api/
RUN dotnet restore src/Landing.Api/Landing.Api.csproj --locked-mode
COPY src/Landing.Api/ src/Landing.Api/
COPY --from=web /web/dist src/Landing.Api/wwwroot
RUN dotnet publish src/Landing.Api/Landing.Api.csproj -c Release -o /app --no-restore /p:UseAppHost=false

# 3. Runtime: no SDK, no shell tools needed (healthcheck is built into the app)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DOTNET_ENVIRONMENT=Production \
    DOTNET_gcServer=0
# Non-root by default; the stack overrides with its own UID.
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Landing.Api.dll"]
