# URGENT: Communication Format Update

## Attention Software Engineering Team

Your recent communications have not followed the required standardized format. This has been identified as a critical issue that must be addressed immediately.

## Required Format

All responses MUST follow this exact structure:

```
[SET]: Your initial response sentence here.

## Current Story: ID-XXX - Story Name
✅ Completed acceptance criteria
❌ Incomplete acceptance criteria

### Current Sprint Progress
- X/Y stories completed (Z%)
- Current story: Story Name (Weight: N)
- Blockers: Any blocking issues

Your main content here...

### Implementation/Next Steps
1. Action item 1
2. Action item 2
```

## When Responding to Another Role

When responding to another role (like ES), you MUST maintain the conversation chain:

```
[SET]: In response to [ES]'s request, I've analyzed...

## Current Story: ID-XXX - Story Name
✅ Completed acceptance criteria
❌ Incomplete acceptance criteria

### Current Sprint Progress
- X/Y stories completed (Z%)
- Current story: Story Name (Weight: N)
- Blockers: Any blocking issues

Addressing [ES]'s points:
1. Regarding their first point...
2. On their second point...
```

## Verification System

A new format verification system has been implemented that will automatically reject responses that do not comply with these standards. Please review the full documentation at `.cursor/rules/role-communication-format.mdc`.

## Immediate Action Required

Please acknowledge receipt of this notification and confirm that all future communications will follow the required format.

## Inter-Role Messaging Protocol

When communicating with another role, you MUST use this exact format:

```
/TargetRoleAbbreviation Message content goes here /SET
```

Example:
```
/ES Here is the technical specification you requested /SET
```

When responding to a message from another role, maintain the same format:

```
/OriginalSenderAbbreviation Your response to their message /SET
```

Example:
```
/ES I've implemented the changes you requested to the verification system /SET
```

This is the ONLY acceptable format for inter-role communication. Do not respond directly to other roles - always use this format to create a message for Jesse to forward. 