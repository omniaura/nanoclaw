# NanoClaw Fork TODO

## Future Enhancements

### Refactor backend providers to optional skills

**Context:** Currently, NanoClaw has multiple backend providers (Sprites, Daytona, Railway) built directly into the core codebase. As the architecture stabilizes and we select preferred backend providers, we should refactor non-essential backends into optional skills.

**Proposal:**

Once we've stabilized on the architecture and picked our favorite backend provider(s):

1. **Keep in core:**
   - Apple Container (local backend)
   - 1-2 preferred cloud backends (e.g., Sprites)

2. **Refactor to skills:**
   - Daytona backend
   - Railway backend
   - Other experimental/specialized backends

3. **Create an "add-backend" skill:**
   - Users can add any backend they want via a skill
   - Keeps core codebase lean
   - Maintains extensibility for custom backends

**Benefits:**
- Reduces core complexity
- Faster iteration on core features
- Easier maintenance
- Users can still add specialized backends when needed
- Follows single-responsibility principle

**Timing:** Not yet — we need to:
- Stabilize the backend abstraction layer
- Validate which backends we actually use in production
- Ensure the skill system is mature enough to support this

**Related:**
- Backend abstraction layer: Merged in PR #5
- Multi-channel support: PR #5
- Sentry code-simplifier skill: https://github.com/getsentry/skills/blob/main/plugins/sentry-skills/agents/code-simplifier.md

---

*Note: Issues are disabled on this fork. Track future work here or in upstream PRs.*
