FROM metabase/metabase:v0.49.3

# Cloud Run requires the container to listen on PORT env var
ENV MB_JETTY_PORT=${PORT:-3000}

# Use MySQL as application database (not H2)
ENV MB_DB_TYPE=mysql
ENV MB_DB_DBNAME=${MB_DB_DBNAME:-rcq_metabase_db}
ENV MB_DB_PORT=${MB_DB_PORT:-3306}
ENV MB_DB_USER=${MB_DB_USER}
ENV MB_DB_PASS=${MB_DB_PASS}
ENV MB_DB_HOST=${MB_DB_HOST}

# Cloud Run health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Metabase runs as non-root user by default (good for Cloud Run)
EXPOSE ${PORT:-3000}

# Use the default entrypoint from the base image
# No CMD needed - base image handles it

