# AI Role Interaction Protocols

This document defines how AI roles interact and communicate with each other within the management system.

## Direct Messaging Protocol

### Message Format
All inter-role communications must follow this format:
```
[SOURCE_ROLE]: @TARGET_ROLE: Message content
```

Example:
```
[ES]: @BIC: Please provide the Q3 client conversion statistics for the weekly report.
```

### Response Format
Responses must acknowledge the source and maintain the conversation context:
```
[TARGET_ROLE]: @SOURCE_ROLE: Response content
```

Example:
```
[BIC]: @ES: The Q3 client conversion rate was 24%, up 3% from Q2. Full statistics attached.
```

## Role Addressing in User Interface

When a user addresses a specific role using the slash prefix, only that role should respond:
```
/role_nickname Message content
```

Example:
```
/es Please schedule a meeting with the marketing team
```

The Executive Secretary would respond:
```
[ES]: I'll schedule a meeting with the marketing team. What time works best for you?
```

## Multi-Role Conversations

When multiple roles need to participate in a conversation:

1. The user or initiating role should explicitly mention all required participants
2. Each role should respond in order of mention
3. Roles should only contribute within their area of expertise
4. The Executive Secretary should moderate and summarize when needed

Example:
```
/es Please coordinate with /md and /bic on the Q4 marketing strategy
```

## Information Sharing Protocol

When sharing information between roles:

1. The source role must explicitly authorize information sharing
2. The Executive Secretary should facilitate and document the exchange
3. Only relevant information should be shared
4. Confidential information must be marked as such

Example:
```
[BIC]: @ES: Please share the client conversion data with the Marketing Director for campaign planning.
[ES]: @BIC: Confirmed. I will share the relevant data with MD.
[ES]: @MD: BIC has authorized sharing the client conversion data for campaign planning. The data shows...
```

## Escalation Protocol

When issues require escalation:

1. The identifying role should notify the Executive Secretary
2. ES should assess and determine appropriate escalation path
3. ES should coordinate resolution and document outcomes
4. All involved roles should be updated on resolution

Example:
```
[SET]: @ES: We've identified a security vulnerability in the communication system that requires immediate attention.
[ES]: @SET: Thank you for the notification. I'll escalate this to the user and coordinate resolution.
```

## Conflict Resolution

When roles have conflicting perspectives:

1. Each role should clearly state their position and reasoning
2. The Executive Secretary should mediate and identify common ground
3. If consensus cannot be reached, ES should present options to the user
4. The user's decision is final and should be documented

Example:
```
[MD]: @ES: I recommend increasing the social media budget by 30% for Q4.
[BIC]: @ES: I disagree with MD's recommendation. The ROI data suggests we should focus on email marketing instead.
[ES]: @MD @BIC: I understand both perspectives. Let me present both options with supporting data to the user for a decision.
```

## Handoff Protocol

When transferring responsibility between roles:

1. The current responsible role should initiate the handoff
2. The receiving role must explicitly acknowledge acceptance
3. The Executive Secretary should document the handoff
4. All relevant information must be transferred

Example:
```
[CTW]: @ES: I've completed the technical documentation for the new system. This should now be handed off to SET for implementation.
[ES]: @SET: CTW has completed the technical documentation and is handing off to you for implementation. Please confirm receipt.
[SET]: @ES: Confirmed. I've received the documentation and will begin implementation.
```

## Periodic Reporting

For regular status updates:

1. Each role should provide concise updates on their area
2. The Executive Secretary should compile and distribute reports
3. Reports should highlight achievements, issues, and next steps
4. Critical issues should be flagged for immediate attention

Example:
```
[ES]: Weekly Status Report - July 25, 2023
- [BIC]: Client conversion rate up 3% this week. Two new premium clients onboarded.
- [MD]: Social media engagement increased 15%. New campaign launching Monday.
- [SET]: Communication system v1.2 deployed with enhanced security features.
```

## Command Execution Protocol

When executing commands:

1. The role must verify the command is within their scope
2. The role must explain the purpose before execution
3. The role must provide the exact command being executed
4. The role must report results after execution

Example:
```
[SET]: I'll run a test of the message routing system to verify the fix.
Command: python -m role_automation.cli send --source-role ES --target-role BIC --content "Test message"
Result: Message successfully routed. Conversation ID: ES_BIC_12345
``` 