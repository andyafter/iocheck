# Database Verification and Seeding Script

**Summary of AI Conversation**

1. **Initial Verification**: 
   - *User Request*: Verify the database schema, migrations, and APIs for the `iocheck` project based on assignment descriptions. Check for example data in the DB.
   - *AI Action*: Ran several shell commands (`psql`, `curl`, `docker`) and read project files (`README.md`, `app.ts`, migrations, `docker-compose.yml`, `ioc.ts`). 
   - *Findings*: The schema and migrations were correctly defined with strict constraints. However, the database was empty, the core API endpoints (`/ioc`, `/lookup`) were stubbed with hardcoded mock data, and the DB connection pool wasn't wired to the Fastify server.

2. **Database Seeding Data**:
   - *User Request*: What kind of example data should the database contain based on the assignment?
   - *AI Action*: Read the `progress.md` roadmap and provided a summary of constraints (`type` must be `ip`, `domain`, or `sha256`; `score` must be 0-100). Provided an example SQL `INSERT` statement covering all types.

3. **Python Seed Script Creation**:
   - *User Request*: Create a Python script to batch insert and delete example data, with local tracking/versioning.
   - *AI Action*: Created `scripts/seed/seed.py` and `requirements.txt`. The script connects to PostgreSQL via `psycopg2`, tracks applied batches locally in `batches.json`, and supports `apply`, `delete`, and `list` commands using `ON CONFLICT DO UPDATE` to handle duplicate insertions safely.

4. **Gitignore & Documentation Update**:
   - *User Request*: Update `.gitignore` and create a simple README for the seed script.
   - *AI Action*: Added `batches.json`, `.venv`, and `__pycache__` to `.gitignore`. Created `scripts/seed/README.md` explaining how to setup the Python virtual environment and use the CLI tool.

5. **Port Conflict Resolution**:
   - *User Request*: The script failed to connect because a native PostgreSQL was intercepting port 5432 on localhost.
   - *AI Action*: Identified the port collision with the host machine. Modified `.env`, `.env.example`, and `README.md` to map the Docker PostgreSQL port to `5433` instead. Restarted the Docker container explicitly passing the updated `.env` file, and successfully seeded the data. 

6. **Docker Compose Port Clarification**:
   - *User Request*: Asked if Docker automatically auto-increments ports (e.g. 5433) and how the port mapping works in `docker-compose.yml`.
   - *AI Action*: Explained that port mapping does not auto-increment. Clarified that `docker-compose.yml` uses environment variable substitution (`${POSTGRES_PORT:-5432}`), allowing port configuration entirely through the `.env` file without modifying the tracked `yaml` file directly.
