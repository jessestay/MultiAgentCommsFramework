# US-S1-D001: Transform Proposal into a Visually Compelling & Professionally Branded Document

As a Marketing Strategist (Jesse Stay)
I want the current `epicwd-proposal-draft-v1.md` to be transformed into a visually appealing, professionally designed document
So that it makes a strong positive impression on the client (Epic Windows & Doors), effectively communicates value, aligns with Stay N Alive branding, and increases the likelihood of acceptance.

## Business Value
A professionally designed proposal enhances credibility, improves readability, and reinforces brand identity, directly contributing to a higher conversion rate for securing client engagements. It showcases attention to detail and a commitment to quality. This user story also aims to establish a reusable framework/tool for future proposal designs.

## Acceptance Criteria

1.  **AC1: Professional Formatting**
    *   GIVEN the current Markdown proposal (`docs/strategy/epicwd-proposal-draft-v1.md`)
    *   WHEN @DES applies visual design and branding elements
    *   THEN the output is a professionally formatted document (e.g., polished PDF or interactive web page) that is significantly more engaging and readable than the plain Markdown.

2.  **AC2: Stay N Alive Branding Integration**
    *   GIVEN Stay N Alive branding guidelines and assets (logo, color palette, fonts - to be provided by user from Canva or other sources)
    *   WHEN @DES incorporates these into the proposal design
    *   THEN the proposal consistently and accurately reflects Stay N Alive's brand identity.

3.  **AC3: Enhanced Visual Appeal**
    *   GIVEN the goal of a "pretty, graphical, professional" document
    *   WHEN the proposal is reviewed by the user
    *   THEN it clearly incorporates elements such as effective typography, strategic use of whitespace, appropriate inclusion of graphics/icons (if applicable), and a clean, modern layout, aligning with Stay N Alive branding.

4.  **AC4: Tooling/Scripting for Transformation (Research & Recommendation)**
    *   GIVEN the user's interest in using free/open-source tools, a script, or an "MCP server" for proposal generation
    *   WHEN @SET and @DES research and evaluate feasible options
    *   THEN a recommendation for the most effective and sustainable method for transforming the Markdown proposal into its final designed format is provided.
    *   AND if a script-based solution or reusable template system is chosen and developed by @SET/@DES, its core reusable components (scripts, templates, libraries) are designed for cross-project use and stored within the shared `.cursor/` directory structure (e.g., this project's `.cursor/proposal-designer-tool/` acting as a distributable module) so that the Multi-agent Communications Framework can leverage this tool on all relevant projects.
    *   AND the solution is documented, version-controlled, and tested for basic functionality.

5.  **AC5: BDD/TDD Principles Adherence (Verification)**
    *   GIVEN the commitment to quality and clear requirements (akin to BDD/TDD)
    *   WHEN the final designed proposal is delivered
    *   THEN it has been verified by @DES and ES against all agreed-upon acceptance criteria and specific visual requirements.

## Tasks

1.  [ ] **ES**: Obtain Stay N Alive branding guidelines and assets (logo, color palette, font specifications, etc.) from the user (e.g., Canva export, API access details).
2.  [ ] **@DES**: Review branding guidelines and assets.
3.  [ ] **@DES & @SET**: Research and discuss options for transforming the Markdown proposal into a visually appealing format (e.g., Pandoc with custom LaTeX/CSS templates, design software like Figma/Canva, static site generator, potential script leveraging open-source tools). Prioritize solutions that allow for reusable templates/scripts stored in `.cursor/`.
4.  [ ] **@DES**: Develop initial design mockups or style concepts for the proposal based on Stay N Alive branding.
5.  [ ] **User**: Review and approve design mockups/style concepts.
6.  [ ] **@DES &/or @SET**: Implement the chosen method to apply the design and branding to the proposal content from `docs/strategy/epicwd-proposal-draft-v1.md`. Ensure reusable components are structured for storage in `.cursor/`.
7.  [ ] **@SET** (if scripted solution): Develop, document, version control, and test any scripts/core tool files, placing reusable parts in `.cursor/proposal-designer-tool/` (or similar path).
8.  [ ] **@DES & ES**: Review the formatted proposal against all Acceptance Criteria.
9.  [ ] **User**: Final review and approval of the designed proposal.

## Technical Notes
*   The final output format (e.g., PDF, web link) needs to be decided. PDF is common for proposals.
*   Consider version control for design assets and templates. Core reusable templates/scripts to live in `.cursor/`.
*   "Stay N Alive" is the company name. User background from jessestay.com, LinkedIn, and Amazon author page can inform the "About Us" or introductory sections if not already present.
*   The script/tool should aim to be maintainable and reusable if possible, with core components in `.cursor/`.

## Definition of Done
*   All Acceptance Criteria (AC1-AC5) are met and verified.
*   A visually enhanced, professionally branded version of the proposal is complete.
*   The chosen transformation process and any developed reusable tool/templates (stored in `.cursor/`) are documented.
*   User has approved the final designed proposal.
*   The final designed document is stored in an appropriate project location (e.g., `docs/strategy/EpicWD-Proposal-StayNAlive-v1.pdf`).

### AC1: Retrieve Stay N Alive Logo URL via Folders API
Scenario: Retrieve Stay N Alive Logo URL via Folders API
  Given I have a valid Canva API access token
  And I can list items in the Canva root folder
  When I search for a folder named "Stay N Alive" in the root folder items
  And I retrieve the folder ID for the "Stay N Alive" folder
  And I list image assets within that folder ID
  Then I should receive a valid URL for an image asset titled "logo" (or a similar brand identifier)

### AC2: Transform Proposal into Visually Compelling Document using Canva API (Revised)
Scenario: Create Branded Proposal PDF using Canva Import and Export APIs
  Given I have a valid Canva API access token
  And the Stay N Alive logo asset ID is known (e.g., "ASSET_PAFF2Dk0F-E")
  And a pre-converted proposal document exists at "assets/proposal.pdf" (or .docx)
  When I create a new Canva design (e.g., "doc" type) programmatically, incorporating the logo asset
  And I import the content from "assets/proposal.pdf" (or .docx) into this Canva design using the Design Imports API
  And I export this Canva design as a PDF file using the Exports API
  Then a new PDF file named "epicwd-proposal-branded-v1.pdf" should be created in the "docs/strategy/" directory
  And this PDF should visually incorporate the Stay N Alive logo and the proposal content.

### AC4: Tooling/Scripting for Transformation (Research & Recommendation) (Revised)
Scenario: Define Reusable Proposal Branding Tool
  Given the process for creating a branded proposal using Canva APIs is defined
  When I define the components of a reusable tool
  Then the tool should consist of:
    1. A script to orchestrate Canva API calls (design creation, asset placement, content import from PDF/DOCX, PDF export).
    2. Configuration for API keys and asset/folder IDs.
    3. This toolset should be stored in ".cursor/proposal-designer-tool/".
  And a recommendation is made for future automated Markdown to PDF/DOCX conversion if environment constraints are lifted. 