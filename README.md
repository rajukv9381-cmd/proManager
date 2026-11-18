# ProManage

A full-stack project management MVP built with React (JavaScript), Node.js, Express, PostgreSQL, and Socket.IO.

## Requirements

- Node.js 20 (20.9 or newer) and npm
- PostgreSQL 16, locally or through Docker Compose

## Get started

1. In this directory, install dependencies: `npm install`.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to your PostgreSQL connection string and replace `JWT_SECRET` with a random secret of at least 24 characters.
3. Start PostgreSQL, for example with `docker compose -f compose.yaml up -d db`. The Compose credentials are for local development only. Alternatively, create a database and user in an existing PostgreSQL server.
4. Run `npm run dev`, then open the Vite URL printed in the terminal (normally `http://127.0.0.1:5173`). Register an account and create a project.

The server creates the tables on startup. To add a teammate, they must first register, then the project owner can add their account by email from the overview. Project members can create and edit tasks, chat, upload files (up to 10 MB), and download project documents. Updates are sent to connected project members in real time. Chat displays the latest 100 messages.

## Run with Docker Compose

1. Copy `.env.example` to `.env` and set `JWT_SECRET` to a random secret of at least 24 characters.
2. Run `docker compose -f compose.yaml up --build`.
3. Open `http://127.0.0.1:3001`. Stop the services with `docker compose -f compose.yaml down`.

The Dockerfile builds the React app and packages it with the Node.js server. Compose starts that image and PostgreSQL together, waits for the database to be ready, and stores database data and uploads in named volumes. The app connects to PostgreSQL using the internal `db` hostname; the `DATABASE_URL` in `.env` is for running Node.js directly on your computer. The example uses host port 5433 to avoid conflicts with an existing PostgreSQL server. If you change `POSTGRES_PORT`, also update the port in `DATABASE_URL` for local Node.js development. The Compose credentials and HTTP setup are for local development, not production. Avoid `down -v` unless you intend to delete the stored database and uploads.

## Separate ECR images

`Dockerfile.client` builds the React app and serves it with Nginx; `Dockerfile.server` packages the Node.js API. The client proxies `/api` and `/socket.io` to `BACKEND_HOST` (default `server:3001`), preserving the browser's host for the server's origin checks.

With Docker running and AWS CLI credentials configured for ECR push, build and push from PowerShell:

```powershell
.\scripts\push-ecr.ps1 -ClientRepository '<client ECR URI>' -ServerRepository '<server ECR URI>' -Tag 'v1'
```

Add `-Profile '<profile>'` to use a named AWS CLI profile. The script builds both images before pushing; if the second push fails, the first may already be in ECR. It uses a temporary Docker credential directory rather than changing your normal Docker login configuration.

For a local Compose demonstration, set `$env:CLIENT_IMAGE` and `$env:SERVER_IMAGE` to the tagged image URIs, copy `.env.example` to `.env`, set a random `JWT_SECRET`, and run `docker compose -f compose.ecr.yaml up`. Open `http://127.0.0.1:8080`. This Compose file uses development-only database credentials and HTTP; it is not a production deployment. Use HTTPS, production secrets, and persistent database and upload storage for a real deployment.

## Deploy the ECR images to EC2

These scripts are for an **x86-64 Amazon Linux 2023** EC2 instance. The existing images were built for x86-64; ARM instances need images built and pushed for ARM. This is a deployment example, not production hardening: see MVP boundaries below before exposing the app publicly.

1. Attach an EC2 instance role with permission to pull both private ECR repositories (for example, `AmazonEC2ContainerRegistryReadOnly`). Do not put AWS access keys in the scripts or on the instance.
2. Point a public domain's DNS A record to the instance's public IPv4 address (prefer an Elastic IP). Allow inbound TCP 80 and 443 in the security group; restrict SSH port 22 to your IP. Ensure the instance can reach ECR, Docker Hub, and the internet. Ports 80 and 443 must be available for Caddy to obtain and renew its HTTPS certificate. If an AAAA record exists, it must also point to this instance and IPv6 traffic must be allowed, or remove it.
3. Copy the `deploy/ec2` directory to the instance, for example using `scp` with your EC2 SSH key. SSH in as `ec2-user` and run:

   ```bash
   cd ~/ec2
   bash setup.sh
   bash deploy.sh example.com \
     838547582366.dkr.ecr.ap-southeast-2.amazonaws.com/react-client \
     838547582366.dkr.ecr.ap-southeast-2.amazonaws.com/node-backend v1
   ```

   Replace `example.com` with your domain. To copy the directory into `~/ec2`, an example from PowerShell is `scp -i <key-file> -r .\deploy\ec2 ec2-user@<ec2-public-ip>:~/ec2`. Setup installs Docker and, if needed, a pinned Docker Compose plugin. It requires the AWS CLI already installed; if it is missing, follow the [AWS CLI installation instructions](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). The deployment script logs in to ECR using the instance role and a temporary Docker credential directory, pulls the images, and starts the stack. It may take additional time for DNS and certificate issuance before `https://example.com` works.

The script creates `deploy/ec2/.env` on the instance with randomly generated database and JWT secrets, restricted to the current user. It reuses that file on redeploy. **Back it up securely**, together with PostgreSQL and uploads; losing or changing the database password in this file does not change the password already stored in PostgreSQL. If data volumes exist but the file is missing, deployment stops rather than creating incompatible secrets. Run the same deployment command again to update or restart the stack; specify another tag only after pushing both images with that tag. Redeployment recreates containers, including the database, and causes a short interruption.

Only Caddy publishes ports. PostgreSQL, uploads, and Caddy certificates use Docker volumes on the EC2 disk. Volumes survive container replacement, but not instance/disk loss; arrange tested off-instance backups (use a PostgreSQL-aware backup such as `pg_dump`, plus the uploads volume and secrets). Never run `docker compose down -v` unless you intend to delete these volumes. Monitor disk space, certificates, application logs, and restart/recovery. To inspect containers, use `sudo docker ps` and `sudo docker logs <container-name>`.

## Task components

The task board lives in `client/features/tasks`. `TaskBoard` organizes the columns and form, `TaskColumn` renders tasks for one status, `TaskCard` displays a task, and `TaskForm` handles task input. The application retains the selected task and saves changes through the existing API.

The board searches the current project's already-loaded tasks by title, description, or assignee. Search applies immediately when possible, throttles updates during continuous typing, and debounces the final update by 300 ms after typing stops. It does not send search requests to the server.

The overview, task board, team chat, and documents views use React lazy loading: their JavaScript is fetched when the view is first opened. A loading indicator is shown while the code loads, and a reload option appears if a view fails to load. This splits frontend code only; project data is still loaded together from the API.

## Client state example

Redux Toolkit stores the selected project ID in `client/features/projects/projectSlice.js`. TanStack Query fetches and caches each signed-in user's project list, invalidates it after project changes and live updates, and clears cached data on sign-out. The project detail and other features still use their existing local state and API calls; this is a starting example, not a full migration.

## Backend structure

The Node.js server is organized into `server/routes` (URL and middleware mappings), `server/controllers` (HTTP requests and responses), and `server/services` (validation, business logic, and database queries). `server/middleware.js` handles authentication, project access, uploads, and errors; `server/socket.js` handles real-time project rooms. `server/index.js` starts and connects these pieces.

## Authentication and authorization

`/login` is public. `/projects` and `/projects/:projectId` require a signed-in user; project API endpoints also enforce membership independently of the frontend. Project owners can add members, while members can work with tasks, chat, and documents. A direct project link is checked against the signed-in user's membership.

Login creates a 15-minute access cookie and a seven-day refresh session. The refresh token is an opaque, HTTP-only cookie; only its hash is stored in PostgreSQL. Refresh rotates the token, and signing out revokes the current session and disconnects its live sockets. The client retries an authenticated request once after refreshing, and uses Web Locks when available to coordinate refreshes across tabs. In browsers without Web Locks, simultaneous refreshes in separate tabs can require signing in again. Existing sessions from before this change require signing in again. Session expiry is absolute, not extended by refresh.

For production, use HTTPS and preserve the original `Host` header at the reverse proxy; state-changing browser requests and socket handshakes check their origin against that host. `NODE_ENV=production` enables secure cookies. This MVP still needs production security controls such as rate limiting, session cleanup, and monitoring.

The Vite development proxy also preserves the browser's `Host` header so these origin checks work for both API and Socket.IO requests.

## Production-style run

Run `npm run build`, then `npm start` with the environment variables configured. Express serves the built application and API on `127.0.0.1:3001` by default; set `HOST` and `PORT` to change the bind address and port. When `NODE_ENV=production`, authentication cookies require HTTPS; deploy behind an HTTPS reverse proxy. Uploaded files are stored in the local `uploads` directory, which must be persisted and backed up alongside the database.

## MVP boundaries

This is a starting point, not a production-hardened enterprise system. It does not include password recovery, email invitations, rate limiting, audit logs, role management beyond project ownership, file scanning, or distributed file storage. Do not expose it publicly without adding appropriate security, operational controls, and database migrations.

## Tests

Set `PROMANAGE_TEST_DATABASE_URL` to a dedicated PostgreSQL test database, then run `npm test`. The integration test creates the schema and temporary test data in that database. Without this variable, the database-dependent test is skipped.
