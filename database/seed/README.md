# Seed Script

This folder contains a small Python script for loading example IOC data into the local PostgreSQL database. It tracks applied batches in `batches.json` so the same batch can be deleted later.

## Setup

Run this from the repository root:

```bash
cd database/seed
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

Make sure the root `.env` contains `IOCHECK_DATABASE_URL` and that PostgreSQL is running.

Apply the default example data:

```bash
python seed.py apply initial_seed
```

List tracked seed batches:

```bash
python seed.py list
```

Delete a seed batch:

```bash
python seed.py delete initial_seed
```

`batches.json` is local state and should not be committed.
