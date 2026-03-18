#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "Installing pre-commit hooks for RCQ-V2..."

if ! command -v poetry >/dev/null 2>&1; then
  echo "Poetry is required. Install it first: https://python-poetry.org/docs/#installation"
  exit 1
fi

echo "Installing backend dev dependencies..."
poetry -C "$BACKEND_DIR" install --with dev --no-root

VENV_BIN="$(poetry -C "$BACKEND_DIR" env info --path)/bin"

echo "Installing git hooks..."
"$VENV_BIN/pre-commit" install --config "$ROOT_DIR/.pre-commit-config.yaml" --install-hooks --overwrite

if [ ! -f "$ROOT_DIR/.secrets.baseline" ]; then
  echo "Generating secrets baseline..."
  (
    cd "$ROOT_DIR"
    git ls-files -z | xargs -0 "$VENV_BIN/detect-secrets" scan \
      --exclude-files '(^|/)(package-lock\.json|poetry\.lock|\.secrets\.baseline)$' \
      > .secrets.baseline
  )
fi

echo "✅ Pre-commit hooks installed successfully!"
echo ""
echo "The following checks will run before each commit:"
echo "  - Secret detection (detect-secrets)"
echo "  - Private key detection"
echo "  - Large file check (>1MB blocked)"
echo "  - Merge conflict markers"
