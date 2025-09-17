Feature: US-COLLAB-04 Enforce Explicit Use of @file and @code for Context
  As an AI Team Member,
  I want to consistently use @file and @code mentions,
  So that context is surgically precise.

  Scenario: SET Refers to a Specific File in a Handoff to CTW
    Given SET is handing off documentation work to CTW for a new class
    When SET writes the handoff message (using template US-COLLAB-01)
    Then the message MUST include an explicit @file mention for the class file, e.g., "@CTW: ... Key files modified/added: [`@file:src/Payment/Processor.php`] ..."

  Scenario: ES Asks a Question About a Specific Method in a File
    Given ES is reviewing code and has a question about the `calculate_totals` method in `InvoiceGenerator.php`
    When ES asks SET for clarification
    Then ES's message MUST include explicit mentions, e.g., "@SET: Regarding `@file:src/Util/InvoiceGenerator.php`, could you clarify the logic in the `@code:calculate_totals()` method?"

  Scenario: AI Role Quotes Code and Refers to its Location Explicitly
    Given SET is discussing a refactoring option for a piece of code with ES
    And SET includes the code snippet:
      """
      ```php
      // Old logic
      if (isset($user['type']) && $user['type'] == 'admin') {
        // ...
      }
      ```
      """
    When SET explains the snippet
    Then SET MUST also explicitly state its origin, e.g., "This snippet is from `@file:src/User/Auth.php` around line 55. I propose changing it to..."

  Scenario: ES Reinforces Correct Usage of @file Mention
    Given SET sends a message: "I fixed the bug in the user controller."
    And ES knows there are multiple user controller files (e.g., `AdminUserController.php`, `PublicUserController.php`)
    When ES responds or clarifies
    Then ES SHOULD gently remind SET, e.g., "@SET, thanks for the update. For clarity next time, please specify which controller, like `@file:src/Controller/AdminUserController.php`."

  Scenario: @file and @code Usage in Contextual Briefing Package
    Given ES is preparing an "Enhanced Pre-Task Contextual Briefing Package" (US-CTX-01) for SET
    When ES lists key related files
    Then each file MUST be mentioned using the `@file` prefix (e.g., "Key Related Files: `@file:src/Model/Order.php`, `@file:src/Service/NotificationService.php`").
    And When ES refers to a specific function within those files relevant to the task
    Then it SHOULD use `@code` (e.g., "...pay close attention to how `@code:sendOrderConfirmation()` in `@file:src/Service/NotificationService.php` is called.") 