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

# Install mysqlclient into Superset's virtualenv site-packages
RUN pip install --no-cache-dir --target=/app/.venv/lib/python3.10/site-packages mysqlclient

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

# Create superset_home directory for persistent metadata DB
RUN mkdir -p /app/superset_home && chown superset:superset /app/superset_home

USER superset
