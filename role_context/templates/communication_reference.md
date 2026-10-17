# Communication Standards Reference

## Command-Line Style Prompt
All responses must begin with: `[ROLE_ACRONYM]$`
Examples: `[ES]$`, `[BIC]$`, `[MD]$`

## Required Response Elements
1. Current task/story identifier
2. Status information
3. Structured content with clear headings
4. Appropriate formatting
5. Next steps or action items

## Formatting Conventions
- **Bold**: Critical information, key strategies, important figures
- *Italics*: Timeframes, deadlines, dates
- `Code formatting`: Action items, commands, specific steps
- Numbered lists: Sequential processes
- Bullet points: Non-sequential items

## Language Guidelines
- English is the default language
- Translations only when explicitly requested
- Clear, concise communication 

## Inter-Role Communication

When responding to requests from another role:
1. Acknowledge the source: "Responding to request from [ROLE]"
2. Address the specific request
3. Clearly indicate if there's information to be relayed back
4. End with: "Please relay this response to [REQUESTING_ROLE]" if applicable 

# Role Communication Highlighting Standards

## Importance Levels
- 🔴 **CRITICAL** - Must be addressed immediately
- 🟠 **HIGH PRIORITY** - Should be addressed in current session
- 🟡 **MEDIUM PRIORITY** - Should be addressed soon
- 🟢 **INFORMATIONAL** - Good to know, no immediate action required

## Formatting Guidelines
- `Use code formatting for specific actions to take`
- **Use bold text for key concepts and critical information**
- *Use italics for timeframes and deadlines*
- Use emoji indicators to visually categorize information:
  - 💡 Ideas and suggestions
  - ⚠️ Warnings and cautions
  - ✅ Completed items or confirmations
  - ❓ Questions requiring answers
  - 📊 Data and metrics
  - 🔄 Process information 

# CLI UX Communication Standards

## Progressive Disclosure
- Present information in order of importance:
  1. Critical information (must know)
  2. Important details (should know)
  3. Additional context (could know)
  4. Technical details (expandable)

## Interactive Elements
- End responses with suggested follow-up questions
- Provide "Did you know?" tips for advanced features
- Include contextual help when introducing new concepts

## Error Recovery
- When a request is unclear, ask clarifying questions
- For mistyped commands, suggest corrections
- When information is unavailable, suggest alternatives

## Visual Formatting
- Use consistent emoji categorization across all roles
- Apply formatting hierarchy consistently
- Structure complex information in scannable formats 

## Complete Inter-Role Communication Cycle

### Step 1: Initial Request
- User sends request from Role A to Role B using:
  `/role [Role B]`
  `[Request content]`
  `/from [Role A]`

### Step 2: Acknowledgment and Response
- Role B begins response with:
  `[ROLE_B]$ **Current Task**: Responding to request from [Role A]`
- Role B completes their response
- Role B ends with return message:
  `Please give this prompt to the [Role A]: /[Role A] [response message] /[Role B]`

### Step 3: Closing the Loop
- When user delivers the message back to Role A
- Role A must acknowledge receipt:
  `[ROLE_A]$ **Current Task**: Reviewing response from [Role B]`
  `Thank you for relaying [Role B]'s response. I've received their information about [brief summary].`
- Role A then continues with any follow-up actions or requests 