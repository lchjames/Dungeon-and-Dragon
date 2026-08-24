# GM D1 Character Management — MVP

> Status: Canonical MVP Implementation Contract  
> Date: 2026-08-24  
> Scope: First server-authoritative GM Character management slice required before Combat runtime.

---

# 1. Authority Boundary

The GM Character workspace must use the same D1 Character records as the Player workspace.

Canonical:

```text
D1
→ authoritative User identity
→ authoritative Character identity / ownership
→ authoritative EXP / Level
→ authoritative Attributes
→ authoritative HP / MP
→ authoritative Basic Skills
```

The legacy browser `localStorage` GM Character editor is not an authoritative Character path for the MVP and must not be used to overwrite D1 Characters.

---

# 2. GM Authentication and Roles

GM access uses the existing server User/session system.

Allowed roles:

```text
gm
admin
```

A normal `player` role may not access the GM workspace or GM APIs.

Canonical access flow:

```text
/gm/
→ no session
   → redirect to shared User login with next=/gm/

→ authenticated player
   → access denied

→ authenticated gm/admin
   → GM D1 workspace
```

Registration continues to create ordinary `player` Users by default.

The MVP must **not** provide an insecure self-promotion route where any authenticated Player can assign themselves the `gm` or `admin` role.

Initial GM/admin provisioning remains a separate deployment/administration task until a secure provisioning flow is implemented.

---

# 3. GM MVP Read Scope

The first GM D1 workspace must be able to inspect:

```text
D1 Users / Player identities
Character ownership
Character status
Character role / occupation
EXP
Derived Level
Core Attributes
HP / MP Current + Max
23 Basic Skills
Creation progression state
Migration flags
Character summary
```

Attributes and Creation Skills are read-only in this slice. Their future GM correction flows must not be invented through a generic unrestricted editor.

---

# 4. GM EXP Authority

GM controls Character EXP.

The MVP supports both:

```text
Add / subtract EXP
Set total EXP
```

Server validation is authoritative.

Canonical constraints:

```text
EXP >= 1
Level = LevelFromEXP(EXP)
Level cap = 100
```

The Client must not directly set Level as a separate authoritative value.

When EXP changes and `CON`, `SIZ`, and `INT` are all available, the server recalculates HP / MP Max using the shared Player resource formulas.

If required Attributes are missing:

```text
EXP / Level may still update
HP / MP formula recalculation is skipped
MISSING_RESOURCE_ATTRIBUTES remains / is recorded
No Attribute value is invented
```

---

# 5. Resource Max Transition

When a formula recalculation changes Max HP or Max MP:

```text
New Max > Old Max
→ Current += (New Max - Old Max)

New Max < Old Max
→ Current = min(Current, New Max)
```

This logic belongs in the shared rules layer so future Level-up and other authoritative resource recalculation paths do not duplicate a different rule.

---

# 6. GM Current HP / MP Correction

The MVP permits GM corrective writes to Current HP / MP.

```text
0 <= Current HP <= Max HP
0 <= Current MP <= Max MP
```

These are explicit GM corrections, not Player numeric edits.

The MVP does **not** expose arbitrary direct editing of:

```text
Max HP
Max MP
Core Attributes
Creation Skill values after Character creation
Level independent from EXP
```

Future approved modifier systems may add structured Max or Attribute modifiers without reopening unrestricted generic numeric editing.

---

# 7. MVP GM UI

The initial D1 GM UI is intentionally narrow:

```text
Dashboard
Players / Users
Characters
Character Detail
```

Character Detail provides:

```text
EXP add / subtract
EXP set-total correction
Current HP correction
Current MP correction
read-only Attributes
read-only Basic Skills
progression / migration information
```

Legacy optional browser-only GM utilities such as maze generation, local JSON database backup, legacy asset management, or generic local Character CRUD do not belong in this authoritative MVP Character-management path.

---

# 8. Deferred

The following are not required by this slice:

```text
secure first-GM provisioning UI
User role administration UI
GM direct Attribute correction
structured Attribute modifiers
structured HP / MP Max modifiers
Inventory authority flows
Ability editing
Combat state
Monster management
Boss management
```

They should be added only when the playable vertical slice reaches the corresponding blocker.
