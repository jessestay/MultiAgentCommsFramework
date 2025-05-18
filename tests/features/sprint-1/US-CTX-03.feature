Feature: US-CTX-03 Implement Structured In-Code Annotations for AI
  As an AI Team Member,
  I want to use a convention for structured in-code annotations,
  So that persistent, localized context is available to AI and humans.

  Background: Annotation Convention
    Given the AI team has adopted the following annotation prefixes:
      | Annotation Prefix         | Purpose                                             |
      | // AI_IMPORTANT_CONTEXT: | Highlights critical context, dependencies, or state | 
      | // AI_DEPRECATION_TARGET: | Marks code for deprecation with details           |
      | // AI_REFACTOR_NOTE:     | Notes complexity or need for caution              |
      | // AI_USAGE_NOTE:         | Provides specific usage guidance                  |

  Scenario: SET Adds an AI Annotation During Development
    Given SET is modifying a complex function `process_data()` in `utils.php`
    And SET identifies that `process_data()` relies on a global state `IS_BATCH_MODE` set elsewhere
    When SET decides to add an AI annotation
    Then SET adds the comment `// AI_IMPORTANT_CONTEXT: Relies on global IS_BATCH_MODE set by batch_controller.php` to `utils.php`
    And this annotation is committed with the code changes

  Scenario: AI Role Observes and Considers an AI Annotation
    Given a file `services/legacy_service.php` contains the annotation `// AI_REFACTOR_NOTE: This code is fragile due to old dependencies. Avoid major changes if possible.`
    And an AI role (e.g., SET or ES) is tasked with refactoring `legacy_service.php`
    When the AI role analyzes `legacy_service.php`
    Then the AI role MUST identify and acknowledge the `AI_REFACTOR_NOTE`
    And the AI role's proposed refactoring plan MUST reflect consideration of the warning (e.g., by proposing minimal changes or a staged refactor)

  Scenario: Annotation is Reviewed
    Given SET has added an `// AI_DEPRECATION_TARGET: To be removed in Sprint 3. Use NewService instead.` annotation to `OldService.php`
    When another AI role or human reviews SET's changes to `OldService.php`
    Then the reviewer SHOULD verify that the `AI_DEPRECATION_TARGET` annotation is clear and appropriate. 