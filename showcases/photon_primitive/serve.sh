#!/bin/bash
# Simple shell script to start the gallery server
# Tries Node.js first, then Python

echo ""
echo "============================================================"
echo "   Photon Surfaces Gallery - Starting Server"
echo "============================================================"
echo ""

# Check for Node.js
if command -v node &> /dev/null; then
    echo "Found Node.js - using serve.js"
    echo ""
    node serve.js $1
    exit 0
fi

# Check for Python
if command -v python3 &> /dev/null; then
    echo "Found Python - using serve.py"
    echo ""
    python3 serve.py $1
    exit 0
fi

# Check for Python (alternative name)
if command -v python &> /dev/null; then
    echo "Found Python - using serve.py"
    echo ""
    python serve.py $1
    exit 0
fi

# Neither found
echo "ERROR: Neither Node.js nor Python found!"
echo "Please install one of the following:"
echo "  - Node.js: https://nodejs.org/"
echo "  - Python: https://www.python.org/"
echo ""
exit 1
