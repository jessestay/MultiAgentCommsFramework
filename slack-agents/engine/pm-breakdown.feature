# PM Breakdown — BDD Scenarios

## Feature: PM breaks CEO requirements into user stories

### Scenario: Content requirement becomes user stories
  Given the CEO sends a content requirement via `ceoToPm`
    | type        | content                                    |
    | title       | Workshop promo content batch               |
    | description | X, Facebook, TikTok for Oct 11 workshop    |
  When the PM processes the requirement
  Then the PM produces 3 user stories (one per platform)
  And each story has acceptance criteria
  And each story is assigned to the CMO
  And the stories are written to Vikunja as subtasks

### Scenario: Visual requirement becomes user stories  
  Given the CEO sends a visual requirement via `ceoToPm`
    | type        | visual                                     |
    | title       | Workshop promo visuals                     |
    | description | Stock-first feed and story visuals         |
  When the PM processes the requirement
  Then the PM produces 2 user stories (feed, stories)
  And each story specifies dimensions and style
  And each story is assigned to the CUXO

### Scenario: PM asks clarifying questions when requirement is ambiguous
  Given the CEO sends a requirement with missing acceptance criteria
  When the PM processes it
  Then the PM identifies the gaps
  And the PM posts clarifying questions to the CEO
  And no stories are created until the CEO responds
