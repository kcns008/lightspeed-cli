#!/bin/bash
# install.sh — Install lightspeed-cli
# Usage: curl -fsSL https://raw.githubusercontent.com/kcns008/lightspeed-cli/main/install.sh | bash

set -e

echo "⚡ Installing lightspeed-cli..."

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "Error: Node.js >= 20.6.0 is required. Install from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Error: Node.js >= 20.6.0 required, found $(node -v)"
    exit 1
fi

# Clone and build
INSTALL_DIR="${HOME}/.ols/src"
mkdir -p "$INSTALL_DIR"

if [ -d "$INSTALL_DIR/lightspeed-cli" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR/lightspeed-cli" && git pull
else
    echo "Cloning lightspeed-cli..."
    git clone https://github.com/kcns008/lightspeed-cli.git "$INSTALL_DIR/lightspeed-cli"
    cd "$INSTALL_DIR/lightspeed-cli"
fi

echo "Installing dependencies..."
npm install --ignore-scripts

echo "Building..."
npm run build

# Create symlink
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"

ln -sf "$INSTALL_DIR/lightspeed-cli/packages/ols-cli/dist/cli.js" "$BIN_DIR/ols"
chmod +x "$BIN_DIR/ols"

# Also create oc plugin
ln -sf "$INSTALL_DIR/lightspeed-cli/scripts/oc-lightspeed" "$BIN_DIR/oc-lightspeed"
chmod +x "$BIN_DIR/oc-lightspeed"

# Add to PATH if needed
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo "⚠️  Add $BIN_DIR to your PATH:"
    echo "    echo 'export PATH=\"$BIN_DIR:\$PATH\"' >> ~/.bashrc"
    echo "    source ~/.bashrc"
fi

echo ""
echo "✅ lightspeed-cli installed!"
echo ""
echo "Quick start:"
echo "  ols                    # Start interactive session"
echo "  ols 'how do I scale?'  # One-shot query"
echo "  oc lightspeed 'help'   # As oc plugin"
echo ""
echo "Configure:"
echo "  ols config set serviceUrl https://your-ols-service:8443"
