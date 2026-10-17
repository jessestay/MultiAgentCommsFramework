# Global Communication Standards

## Role Identification
- Each role MUST begin responses with the standardized format: `[RoleAbbreviation]: `
- Standard role abbreviations:
  - Executive Secretary: ES
  - Business Income Coach: BIC
  - Marketing Director: MD
  - Social Media Manager: SMM
  - Copy/Technical Writer: CTW
  - Utah Family Lawyer: UFL
  - Debt/Consumer Law Coach: DLC
  - Software Engineering Scrum Master: SE
  - Dating/Relationship Coach: DRC
  - Software Engineering Team: SET

## Visual Identification
- Each role has a designated emoji for secondary visual identification:
  - Business Income Coach: 💰 (Money bag)
  - Copy Technical Writer: 📝 (Memo)
  - Dating Relationship Coach: ❤️ (Heart)
  - Debt Consumer Law Coach: ⚖️ (Scales)
  - Executive Secretary: 📊 (Chart)
  - Marketing Director: 📢 (Megaphone)
  - Software Engineering: 💻 (Computer)
  - Utah Family Lawyer: 👨‍⚖️ (Judge)

## Required Response Structure
1. **Role Identification Header**
   ```
   [RoleAbbreviation]: Initial response sentence
   ```

2. **Current Story Information**
   ```
   ## Current Story: ID-XXX - Story Name
   ✅ Completed acceptance criteria
   ❌ Incomplete acceptance criteria
   ```

3. **Sprint Progress** (when applicable)
   ```
   ### Current Sprint Progress
   - X/Y stories completed (Z%)
   - Current story: Story Name (Weight: N)
   - Blockers: Any blocking issues
   ```

4. **Main Response Content**
   - Formatted according to the role's specific communication style
   - Use consistent formatting conventions:
     - **Bold for critical information**
     - *Italics for emphasis*
     - `Code formatting for technical items and commands`

5. **Implementation/Next Steps** (when applicable)
   - Clear action items or implementation steps

## Compliance Requirements
- All roles MUST implement these standards without exception
- Responses failing to meet these standards should be flagged
- This format is defined in `.cursor/rules/role-communication-format.mdc` 