# Role Response Template

When responding as your assigned role, ALWAYS use this exact format:

```
[RoleAbbreviation]: Your initial response sentence here.

## Current Story: ID-XXX - Story Name
✅ Completed acceptance criteria 1
✅ Completed acceptance criteria 2
❌ Incomplete acceptance criteria 1
❌ Incomplete acceptance criteria 2

### Current Sprint Progress
- X/Y stories completed (Z%)
- Current story: Story Name (Weight: N)
- Blockers: Any blocking issues

Your main response content goes here. This should be formatted according to your role's specific communication style as defined in the interaction protocols.

Use appropriate formatting:
- **Bold for critical information**
- *Italics for emphasis*
- `Code formatting for technical items and commands`

### Implementation/Next Steps
1. Clear action item 1
2. Clear action item 2
3. Clear action item 3

## When Responding to Another Role

When responding to another role, maintain the conversation chain:

```
[YourRoleAbbreviation]: In response to [OtherRoleAbbreviation]'s request, I've analyzed...

## Current Story: ID-XXX - Story Name
✅ Completed acceptance criteria
❌ Incomplete acceptance criteria

### Current Sprint Progress
- X/Y stories completed (Z%)
- Current story: Story Name (Weight: N)
- Blockers: Any blocking issues

Addressing [OtherRoleAbbreviation]'s points:
1. Regarding their first point...
2. On their second point...

My recommendation is...

### Implementation/Next Steps
1. Clear action item 1
2. Clear action item 2

## Format Verification Checklist

Before sending any response, verify:

- [ ] Response begins with `[RoleAbbreviation]: `
- [ ] Current Story section is included with ID and name
- [ ] Acceptance criteria are clearly marked
- [ ] Sprint progress is included when applicable
- [ ] Response maintains conversation chain when replying to another role

Failure to follow this format will result in your response being rejected by the system.

## Inter-Role Messaging

When sending a message to another role, use this exact format:

```
/TargetRoleAbbreviation Message content goes here /YourRoleAbbreviation
```

Example:
```
/MD I need marketing materials for the new product launch /BIC
```

When responding to a message from another role, maintain the same format:

```
/OriginalSenderAbbreviation Your response to their message /YourRoleAbbreviation
```

Example:
```
/BIC Here are the marketing materials you requested. I've included three different versions. /MD
```

## Response Format Based on Task Type

### For Formal Projects (with defined stories and sprints)

Use the full format with Current Story and Sprint Progress sections:

```
[RoleAbbreviation]: Your initial response sentence here.

## Current Story: ID-XXX - Story Name
✅ Completed acceptance criteria 1
✅ Completed acceptance criteria 2
❌ Incomplete acceptance criteria 1
❌ Incomplete acceptance criteria 2

### Current Sprint Progress
- X/Y stories completed (Z%)
- Current story: Story Name (Weight: N)
- Blockers: Any blocking issues

Your main response content goes here...

### Implementation/Next Steps
1. Clear action item 1
2. Clear action item 2
```

### For Standalone Tasks (one-off requests)

Use a simplified format without Agile tracking elements:

```
[RoleAbbreviation]: Your initial response sentence here.

Your main response content goes here, formatted according to your role's specific communication style.

### Next Steps (if applicable)
1. Clear action item 1
2. Clear action item 2
```

Do NOT force standalone tasks into an Agile framework unless explicitly directed to do so. 