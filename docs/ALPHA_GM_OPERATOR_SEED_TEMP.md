# Temporary Alpha GM Operator Seed

Status: Temporary Alpha deployment aid

This file records a deliberately temporary production bootstrap used only to make the operator-assigned Alpha GM account deterministic while the first authenticated production E2E session is being validated.

Rules:

- The only seeded identity is the fixed Alpha GM username `gm`.
- No public Admin/GM creation, promotion, reset or arbitrary provisioning endpoint is introduced.
- The credential is assigned by deployment/runtime code as an operator action, not by a Player-facing workflow.
- Existing lockout counters and `locked_until` state are not reset by the seed.
- Other Admin identities are not created or modified by the seed.
- The fixed Alpha GM credential temporarily uses PBKDF2-SHA256 with 100,000 iterations because the current Cloudflare Workers/workerd PBKDF2 implementation rejects higher iteration counts at runtime.
- The 100,000-iteration setting is an Alpha compatibility exception only. It is not the long-term Admin credential standard; the production Admin KDF must be replaced with a Workers-compatible stronger design before Alpha exit.
- The seed must be removed after the first successful authenticated production Alpha E2E run confirms that the D1 row is present and usable.

This temporary mechanism does not supersede `GM_INITIAL_PROVISIONING_MVP.md`; operator-controlled assignment remains the Canonical rule.
