Feature: US-CTX-02 Implement "Teach Back" Context Confirmation Process
  As an AI Team Member,
  I want SET to "teach back" its understanding of complex tasks,
  So that ES can confirm alignment before coding.

  Scenario: SET Successfully Teaches Back Understanding
    Given SET has received an "Enhanced Pre-Task Contextual Briefing Package" for a complex task
    When SET formulates its "teach back" summary
    And the summary includes the task goal, key files, and acknowledgement of critical context
    And SET communicates this summary to ES
    Then ES reviews the summary
    And ES confirms that SET's understanding is aligned with the task requirements and briefed context
    And SET can proceed with implementation

  Scenario: SET's Teach Back Reveals Misunderstanding
    Given SET has received an "Enhanced Pre-Task Contextual Briefing Package" for a complex task
    When SET formulates its "teach back" summary
    And SET communicates this summary to ES
    But ES determines SET's understanding shows a misalignment with a key requirement
    Then ES provides immediate clarification to SET
    And SET must re-evaluate understanding and potentially perform another teach back
    And SET does not proceed with implementation until alignment is confirmed 