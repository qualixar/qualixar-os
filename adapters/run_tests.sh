#!/bin/bash
# Run Python adapter tests for Qualixar OS
# Requires: pip install pytest httpx
# Run from the Qualixar OS root so adapters package imports work correctly
cd "$(dirname "$0")/.."
python3 -m pytest adapters/test_client.py adapters/test_autogen.py adapters/test_langchain.py adapters/test_crewai.py adapters/test_adk.py -v "$@"
