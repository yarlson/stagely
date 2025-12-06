### 1. Functional Requirements (FRs)

These define the specific behaviors and features the system will support.

#### FR-01: Agent Connectivity & Registration

- **FR-01.1:** The Agent must automatically register with the Control Plane upon first boot using a pre-injected `AGENT_TOKEN`.
- **FR-01.2:** The Agent must establish an outbound persistent WebSocket connection to the Control Plane.
- **FR-01.3:** The Agent must automatically attempt to reconnect if the WebSocket connection is severed (e.g., exponential backoff).
- **FR-01.4:** The Agent must send a "Heartbeat" ping to the Control Plane at a defined interval (e.g., every 30 seconds) to verify liveness.

#### FR-02: Secret Management

- **FR-02.1:** Users must be able to create, update, and delete secrets via the Dashboard.
- **FR-02.2:** Secrets must support a "Scope" attribute:
  - `Global`: Injected into all services.
  - `Service-Specific`: Injected only into services matching the exact name in `docker-compose.yml`.
- **FR-02.3:** The System must never return raw secret values to the Frontend after they are saved (write-only or masked display).

#### FR-03: Deployment Execution (The "Override" Strategy)

- **FR-03.1:** Upon receiving a deployment command, the Agent must generate a temporary `docker-compose.stagely.yml` file containing the scoped environment variables.
- **FR-03.2:** The Agent must execute a deployment using the Docker Compose merge pattern: `docker compose -f docker-compose.yml -f docker-compose.stagely.yml up -d`.
- **FR-03.3:** The Agent must strictly remove the temporary secret file immediately after the Docker command completes (success or failure).

#### FR-04: Observability & Feedback

- **FR-04.1:** The Agent must stream `stdout` and `stderr` from the Docker deployment command back to the Control Plane via WebSocket in real-time.
- **FR-04.2:** The Control Plane must broadcast these log streams to the Frontend for live user feedback.
- **FR-04.3:** Post-deployment, the Agent must perform a health check (e.g., `docker compose ps`) to verify containers are in a `running` state.
- **FR-04.4:** The Agent must report a final status of `SUCCESS` or `FAILED` to the Control Plane based on the health check.

#### FR-05: User Management

- **FR-05.1:** Users must be able to authenticate using GitHub OAuth.
- **FR-05.2:** Users must be able to group Agents and Secrets into "Projects."

---

### 2. Non-Functional Requirements (NFRs)

These define the quality attributes and system constraints. I have kept these grounded in the reality of a Go/Docker architecture.

#### NFR-01: Security (Data Protection)

- **NFR-01.1 (Encryption at Rest):** All user secrets stored in the database must be encrypted using AES-256-GCM.
- **NFR-01.2 (Encryption in Transit):** All communication between Agent, Server, and Frontend must occur over TLS (HTTPS/WSS).
- **NFR-01.3 (Zero-Inbound Policy):** The Agent must not require any inbound ports to be opened on the user's firewall; it must operate strictly via outbound traffic.

#### NFR-02: Performance & Latency

- **NFR-02.1 (Deployment Overhead):** The Agent's processing time (parsing YAML + generating override file) must add less than **500ms** to the total deployment time.
- **NFR-02.2 (UI Feedback):** The latency between the Agent capturing a log line and the User seeing it on the Dashboard should be under **1 second** (assuming standard network conditions).

#### NFR-03: Reliability

- **NFR-03.1 (Atomic Updates):** Deployment failures (e.g., Docker syntax error) must not leave the application in a broken state; the existing containers should remain running if the new configuration fails to apply (relies on Docker's native behavior).
- **NFR-03.2 (Crash Recovery):** If the Agent process crashes, it must automatically restart (via Systemd or Docker restart policy) and reconnect to the Control Plane without user intervention.

#### NFR-04: Portability & Compatibility

- **NFR-04.1:** The Agent binary must be statically linked and runnable on major Linux distributions (Ubuntu, Debian, Alpine) without external dependencies other than the Docker CLI.
- **NFR-04.2:** The Agent must support standard `docker-compose.yml` (Version 3+) files.

#### NFR-05: Scalability (Control Plane)

- **NFR-05.1:** The WebSocket Hub must be able to support concurrent connections from at least **1,000 Agents** on a standard single-node VPS (e.g., 2 vCPU, 4GB RAM) without significant degradation. (Go's `goroutines` make this easily achievable).

---

### Summary of Constraints

| Metric              | Target         | Rationale                                                                         |
| :------------------ | :------------- | :-------------------------------------------------------------------------------- |
| **Agent CPU Usage** | < 5% avg       | The Agent is a sidecar; it shouldn't steal resources from the User's app.         |
| **Agent Memory**    | < 50 MB        | Go binaries are efficient; this leaves room for the User's containers.            |
| **Log Buffer**      | Last 100 lines | In case of connection drop, we buffer slightly, but don't store infinite history. |
