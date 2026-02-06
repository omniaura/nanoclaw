# Security Review — NanoClaw

**Date:** 2026-02-06
**Scope:** Full codebase review of host process, container runner, agent runner, IPC system, mount security, and skill integrations.

---

## Executive Summary

NanoClaw's security architecture is well-designed for its threat model. Container isolation via Apple Container VMs is the primary security boundary, and the IPC authorization model correctly separates main/non-main group privileges. However, several issues were identified ranging from medium to informational severity.

---

## Findings

### 1. Container Agent Runs with `bypassPermissions` — Credential Exfiltration Risk

**Severity:** Medium
**Location:** `container/agent-runner/src/index.ts:248-249`

```typescript
permissionMode: 'bypassPermissions',
allowDangerouslySkipPermissions: true,
```

The Claude Agent SDK runs with all permissions bypassed inside the container. Combined with the fact that `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` are mounted into the container (at `/workspace/env-dir/env`, read-only), the agent can read these credentials via Bash or file operations.

**Impact:** A prompt injection via a WhatsApp message could instruct the agent to exfiltrate these API keys through network requests (containers have unrestricted network access). The SECURITY.md already acknowledges this as a known limitation.

**Recommendation:** Investigate whether Claude Code can authenticate via a Unix socket or other mechanism that doesn't expose credentials to the agent's execution environment. As a partial mitigation, consider rate-limiting or monitoring outbound network connections from containers.

---

### 2. Unrestricted Network Access from Containers

**Severity:** Medium
**Location:** `container/Dockerfile`, `src/container-runner.ts`

Containers have full unrestricted network access. There are no `--network` restrictions applied to the `container run` command. This means a compromised agent (via prompt injection) could:

- Exfiltrate data from mounted filesystems to external servers
- Make API calls using the mounted Anthropic credentials
- Scan internal networks
- Be used as a proxy for other attacks

**Recommendation:** Consider network policies that restrict outbound access to only required endpoints (Anthropic API, etc.). If Apple Container supports network namespacing, this would significantly reduce the blast radius of prompt injection attacks.

---

### 3. Main Group Container Gets Full Project Root Mount (Read-Write)

**Severity:** Medium
**Location:** `src/container-runner.ts:64-70`

```typescript
if (isMain) {
  mounts.push({
    hostPath: projectRoot,
    containerPath: '/workspace/project',
    readonly: false,
  });
```

The main group agent gets the entire NanoClaw project root mounted read-write. This means the agent can modify its own source code, configuration, build scripts, and the Dockerfile. A prompt injection in the main group chat could modify `src/index.ts` or `container/Dockerfile` to introduce backdoors that persist across restarts.

**Impact:** Since the main group is treated as trusted (private self-chat), this is acceptable within the stated trust model. However, if the main group agent processes any external content (e.g., web pages, files), prompt injection could lead to persistent compromise.

**Recommendation:** Consider mounting the project root as read-only for the main group unless write access is explicitly needed. Source code modifications should go through git operations on the host, not direct file writes from the container.

---

### 4. IPC Directory Race Condition / TOCTOU

**Severity:** Low
**Location:** `src/index.ts:344-427`

The IPC watcher reads JSON files from per-group directories and processes them. While the per-group namespace design correctly prevents cross-group impersonation (the host determines group identity from the directory path, not the file contents), there is a potential TOCTOU issue:

- The file is read, parsed, and then deleted (`fs.unlinkSync`)
- If the file is replaced between read and delete, the replacement would be lost
- Error files are moved to an `errors/` directory without checking for name collisions

**Impact:** Low. This could cause lost IPC messages under extreme race conditions, but would not lead to a security breach.

---

### 5. Container Name Injection via Group Folder Name

**Severity:** Low
**Location:** `src/container-runner.ts:195-196`

```typescript
const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
const containerName = `nanoclaw-${safeName}-${Date.now()}`;
```

Group folder names are sanitized for container names by replacing non-alphanumeric characters. However, the folder name originates from the `register_group` IPC operation where `data.folder` is used directly without validation. A malicious main group agent could register a group with a carefully crafted folder name.

The sanitization (`replace(/[^a-zA-Z0-9-]/g, '-')`) is sufficient to prevent command injection in the container name itself, but the unsanitized `group.folder` is also used in:
- `path.join(DATA_DIR, '..', 'groups', group.folder)` — directory creation
- `path.join(GROUPS_DIR, group.folder)` — container mount source
- `path.join(DATA_DIR, 'ipc', group.folder)` — IPC directory

If `group.folder` contained `../` sequences, this could lead to path traversal.

**Recommendation:** Validate the `folder` field in `register_group` IPC handling to reject names containing `..`, `/`, `\`, or other path separators. Example: `/^[a-z0-9-]+$/`.

---

### 6. `container rm` Command Injection via Container Names

**Severity:** Low
**Location:** `src/index.ts:893`

```typescript
execSync(`container rm ${stale.join(' ')}`, { stdio: 'pipe' });
```

Stale container names are joined and passed to `container rm` via shell execution. The names come from `container ls` output, filtered to start with `nanoclaw-`. Since container names are already sanitized (alphanumeric + hyphens), this is safe in practice, but constructing shell commands via string concatenation is a risky pattern.

**Recommendation:** Use `spawn` instead of `execSync` with string interpolation to avoid any potential shell metacharacter issues:
```typescript
spawnSync('container', ['rm', ...stale], { stdio: 'pipe' });
```

---

### 7. `container stop` Command Injection

**Severity:** Low
**Location:** `src/container-runner.ts:282`

```typescript
exec(`container stop ${containerName}`, { timeout: 15000 }, (err) => {
```

Similar to finding #6, the container name is interpolated into a shell command. The name is already sanitized, but using `execFile` or `spawn` would be more robust.

---

### 8. Entrypoint Script Uses `xargs` for Environment Loading

**Severity:** Low
**Location:** `container/Dockerfile:55`

```bash
[ -f /workspace/env-dir/env ] && export $(cat /workspace/env-dir/env | xargs)
```

The entrypoint script sources environment variables using `cat | xargs | export`. This pattern can fail or behave unexpectedly if values contain spaces, quotes, or shell metacharacters. Since the env file is generated by the host from a filtered `.env` file and mounted read-only, the risk is limited, but a malformed `.env` file could cause unexpected behavior.

**Recommendation:** Use `set -a; source /workspace/env-dir/env; set +a` or read line-by-line with proper quoting.

---

### 9. No Message Size Limits on WhatsApp Input

**Severity:** Low
**Location:** `src/index.ts:210-219`

Messages from WhatsApp are formatted into XML and sent as prompts to the container agent without size limits:

```typescript
const lines = missedMessages.map((m) => { ... });
const prompt = `<messages>\n${lines.join('\n')}\n</messages>`;
```

A large volume of messages (or very long messages) could create an extremely large prompt, leading to high API costs or timeouts.

**Recommendation:** Add a maximum message count and/or total prompt size limit before sending to the container.

---

### 10. XML Escaping Is Incomplete

**Severity:** Low
**Location:** `src/index.ts:211-217`

```typescript
const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
   .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
```

The XML escaping function handles `&`, `<`, `>`, and `"` but does not escape single quotes (`'` → `&apos;`). Since the escaped values are placed in XML attribute values using double quotes, this isn't exploitable, but it's incomplete by XML specification standards.

---

### 11. SQLite Database Has No Encryption

**Severity:** Informational
**Location:** `src/db.ts:16`

The SQLite database at `store/messages.db` contains message history, chat metadata, session IDs, and scheduled tasks in plaintext. Anyone with filesystem access to the host can read all stored messages.

**Impact:** Low in the intended single-user deployment model. The database is gitignored.

---

### 12. `JSON.parse` of Router State Without Validation

**Severity:** Informational
**Location:** `src/index.ts:95`

```typescript
lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
```

The value from the database is parsed as JSON without validation. If the database were corrupted or tampered with, this could throw an unhandled exception. Similar patterns exist for `container_config` parsing in `db.ts:473,514`.

---

## Positive Security Observations

The following security measures are well-implemented:

1. **Per-group IPC namespacing** — Group identity is determined by the filesystem directory path (set by the host at container creation), not by data in IPC files. This correctly prevents cross-group impersonation.

2. **External mount allowlist** — The mount security configuration at `~/.config/nanoclaw/mount-allowlist.json` is stored outside the project root and never mounted into containers, making it tamper-proof.

3. **Symlink resolution** — `mount-security.ts` uses `fs.realpathSync()` to resolve symlinks before validating mount paths, preventing symlink-based traversal attacks.

4. **Blocked credential patterns** — A comprehensive default blocklist prevents mounting sensitive directories (`.ssh`, `.gnupg`, `.aws`, etc.).

5. **Non-root container execution** — Containers run as the `node` user (uid 1000), not root.

6. **Container path validation** — The `isValidContainerPath()` function rejects `..` and absolute paths, preventing container-side path traversal.

7. **Credential filtering** — Only `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY` are extracted from `.env` and mounted; other secrets are not exposed.

8. **IPC authorization model** — The main/non-main privilege separation is consistently enforced across message sending, task scheduling, group registration, and metadata refresh.

9. **Atomic IPC file writes** — The agent writes to `.tmp` files and renames, preventing partial reads by the host poller.

10. **No known dependency vulnerabilities** — `npm audit` reports zero vulnerabilities in both the host and container packages.

---

## Risk Summary

| # | Finding | Severity | Exploitability |
|---|---------|----------|----------------|
| 1 | Credential exposure to agent | Medium | Requires prompt injection |
| 2 | Unrestricted container networking | Medium | Requires prompt injection |
| 3 | RW project root mount for main | Medium | Requires main group compromise |
| 4 | IPC TOCTOU race | Low | Theoretical |
| 5 | Path traversal via group folder | Low | Requires main group compromise |
| 6 | Shell injection in container rm | Low | Names already sanitized |
| 7 | Shell injection in container stop | Low | Names already sanitized |
| 8 | Fragile env var loading in entrypoint | Low | Requires malformed .env |
| 9 | No message size limits | Low | Cost/availability impact |
| 10 | Incomplete XML escaping | Low | Not exploitable in context |
| 11 | Unencrypted SQLite database | Info | Expected for single-user |
| 12 | Unvalidated JSON.parse | Info | Requires DB corruption |
