#!/bin/bash
# SETUP SCRIPT FOR DISMANTLER V5 (PYTHON POWERED)

echo "🚀 Inizializzazione Ambiente Python Dismantler V5..."

# Move into project directory
cd /Users/augustogenca/Documents/Sviluppo/PDF_Catalog/v5_python

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "📦 Installazione dipendenze (Reflex, PyMuPDF, Gemini SDK)..."
pip install --upgrade pip
pip install reflex pymupdf google-generativeai sqlalchemy pymysql python-dotenv pydantic-settings

# Initialize Reflex (non-interactive)
echo "⚡ Inizializzazione Reflex..."
reflex init

echo "✅ Ambiente pronto!"
echo "--------------------------------------------------"
echo "Per avviare il nuovo lab in Python:"
echo "1. source venv/bin/activate"
echo "2. reflex run"
echo "--------------------------------------------------"
