"""
CLI entry point for the de-id pipeline.
Run: python -m python_deid.run_deid < input.txt
"""

from python_deid.deid_pipeline import main

if __name__ == "__main__":
    main()
