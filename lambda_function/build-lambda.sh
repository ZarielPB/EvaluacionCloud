#!/usr/bin/env bash
# Empaqueta la funcion Lambda con wheels del runtime python3.12.
# Especifico de Linux x86_64, que es la plataforma del host y la de los
# contenedores public.ecr.aws/lambda/python:3.12 (Amazon Linux 2023).
set -euo pipefail
cd "$(dirname "$0")"

PYTHON_VERSION_RUNTIME="3.12"
ABI_RUNTIME="cp312"
PLATAFORMA_RUNTIME="manylinux2014_x86_64"

rm -rf build lambda_function.zip
mkdir -p build

if [ ! -d venv ]; then
    python3 -m venv venv
fi
venv/bin/python -m pip install --quiet --upgrade pip

venv/bin/python -m pip install \
    --only-binary=:all: \
    --no-deps \
    --platform "$PLATAFORMA_RUNTIME" \
    --python-version "$PYTHON_VERSION_RUNTIME" \
    --implementation cp \
    --abi "$ABI_RUNTIME" \
    --target build \
    -r requirements.txt

zip -q -r lambda_function.zip lambda_function.py
(cd build && zip -q -r ../lambda_function.zip . -x '*__pycache__*' -x '*.pyc')

echo "--- contenido del paquete ---"
unzip -l lambda_function.zip | grep -E "lambda_function.py|PIL/__init__|_imaging" | head -5
echo "--- binarios nativos para el runtime ---"
unzip -l lambda_function.zip | grep -c "$ABI_RUNTIME" | xargs echo "archivos $ABI_RUNTIME:"
ls -lh lambda_function.zip
