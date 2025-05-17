#!/bin/bash

echo "Creating virtual environment in recommendationEngine/venv..."
python3 -m venv recommendationEngine/venv

echo "Installing Python dependencies..."
source recommendationEngine/venv/bin/activate
pip install -r recommendationEngine/requirements.txt
deactivate

echo "Running npm install..."
npm install

echo "✅ Setup completed."
