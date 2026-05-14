import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

# Setup paths based on script location.
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent.resolve()

# Load the local .env in the seed folder if it exists, otherwise fall back to project root
ENV_PATH = SCRIPT_DIR / ".env"
if not ENV_PATH.exists():
    ENV_PATH = PROJECT_ROOT / ".env"

BATCH_STATE_FILE = SCRIPT_DIR / "batches.json"

# Load the .env.
load_dotenv(ENV_PATH)


def get_db_connection():
    db_url = os.environ.get("IOCHECK_DATABASE_URL")
    if not db_url:
        print("Error: IOCHECK_DATABASE_URL not found in .env")
        sys.exit(1)
    try:
        return psycopg2.connect(db_url)
    except psycopg2.Error as e:
        print(f"Database connection error: {e}")
        sys.exit(1)


def load_batches():
    if BATCH_STATE_FILE.exists():
        with open(BATCH_STATE_FILE, "r") as f:
            return json.load(f)
    return {}


def save_batches(batches):
    with open(BATCH_STATE_FILE, "w") as f:
        json.dump(batches, f, indent=2)


# Default dataset to test.
DEFAULT_IOCS = [
    ("ip", "185.15.59.224", "alienvault", 95),
    ("ip", "8.8.8.8", "whitelist_override", 0),
    ("domain", "evil-phishing-login.com", "internal_soc", 100),
    ("domain", "suspicious-tracker.net", "threat_feed_b", 65),
    ("sha256", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "virustotal", 90),
]


def apply_batch(name):
    batches = load_batches()
    if name in batches:
        print(f"Error: Batch '{name}' already exists locally. Delete it first if you want to recreate.")
        sys.exit(1)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            inserted_records = []
            for item in DEFAULT_IOCS:
                # Use ON CONFLICT DO UPDATE to gracefully handle duplicates.
                cur.execute(
                    """
                    INSERT INTO iocs (type, value, source, score)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (type, value) DO UPDATE
                    SET source = EXCLUDED.source, score = EXCLUDED.score, added_at = NOW();
                    """,
                    item,
                )
                inserted_records.append({"type": item[0], "value": item[1]})

            conn.commit()

            # Save state locally.
            batches[name] = {
                "records": inserted_records,
                "description": "Default initial batch",
            }
            save_batches(batches)
            print(f"Successfully applied batch '{name}' with {len(DEFAULT_IOCS)} records.")
    except Exception as e:
        conn.rollback()
        print(f"Error applying batch: {e}")
    finally:
        conn.close()


def delete_batch(name):
    batches = load_batches()
    if name not in batches:
        print(f"Error: Batch '{name}' not found in local state 'batches.json'.")
        sys.exit(1)

    records = batches[name]["records"]
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            for rec in records:
                cur.execute("DELETE FROM iocs WHERE type = %s AND value = %s", (rec["type"], rec["value"]))

            conn.commit()

            # Remove state locally.
            del batches[name]
            save_batches(batches)
            print(f"Successfully deleted batch '{name}' ({len(records)} records removed).")
    except Exception as e:
        conn.rollback()
        print(f"Error deleting batch: {e}")
    finally:
        conn.close()


def list_batches():
    batches = load_batches()
    if not batches:
        print("No batches currently tracked in 'batches.json'.")
        return

    print("Currently tracked batches:")
    for name, data in batches.items():
        print(f" - {name} ({len(data['records'])} records)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="IOC Database Seed Manager")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parser_apply = subparsers.add_parser("apply", help="Apply a batch of data to the database")
    parser_apply.add_argument("name", type=str, help="Name of the batch, for example 'initial_seed'")

    parser_delete = subparsers.add_parser("delete", help="Delete a batch from the database")
    parser_delete.add_argument("name", type=str, help="Name of the batch to delete")

    subparsers.add_parser("list", help="List all applied batches")

    args = parser.parse_args()

    if args.command == "apply":
        apply_batch(args.name)
    elif args.command == "delete":
        delete_batch(args.name)
    elif args.command == "list":
        list_batches()
