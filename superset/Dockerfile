# Custom Apache Superset image with MySQL driver
FROM apache/superset:latest

USER root

# Install system dependencies for mysqlclient
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        default-libmysqlclient-dev \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install mysqlclient in Superset's virtualenv
RUN /app/.venv/bin/pip install --no-cache-dir mysqlclient

# Clean up build dependencies
RUN apt-get remove -y gcc pkg-config && \
    apt-get autoremove -y && \
    apt-get clean

# Copy Superset configuration
COPY superset_config.py /app/superset_config.py
ENV SUPERSET_CONFIG_PATH=/app/superset_config.py

# Copy init script
COPY superset_init.sh /app/superset_init.sh
RUN chmod +x /app/superset_init.sh

USER superset
