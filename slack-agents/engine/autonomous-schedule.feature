# Autonomous Driver Schedule — BDD Scenarios
#
# Jesse's law (Oct 10, 2026): "It should have also been detected as missing
# by TDD and BDD."
#
# ROOT CAUSE (Oct 9, 2026): The autonomousRunner.js script existed and worked,
# but no cron job ran it. Agents went silent for hours. The demo checker
# flagged silence, but nothing drove the agents to produce output. The unit
# tests verified agents EXPOSE runAutonomous() but never verified the driver
# is actually SCHEDULED.
#
# These scenarios verify the scheduling invariant at the behavior level:
# a working driver script with no schedule is a defect, not a deployment.

## Feature: Autonomous driver is scheduled

### Scenario: Driver script exists but is not scheduled — defect detected
  Given the autonomousRunner.js script exists and runs successfully
  And the autonomous-agent-driver schedule is NOT present in the runtime
  When check-schedules.js runs
  Then it reports autonomous-agent-driver as MISSING
  And it flags the missing driver as CRITICAL
  And it exits with code 1

### Scenario: Driver is scheduled — engine stays healthy
  Given the autonomousRunner.js script exists
  And the autonomous-agent-driver schedule IS present in the runtime
  When check-schedules.js runs
  Then it reports autonomous-agent-driver as OK
  And it exits with code 0

### Scenario: Install script detects missing schedule
  Given the schedules.json manifest declares autonomous-agent-driver
  And the autonomous-agent-driver schedule is NOT present in the runtime
  When install-schedules.sh runs
  Then it reports autonomous-agent-driver as MISSING
  And it shows the command and owner needed to recreate it
  And it exits with code 1

### Scenario: New agent added to runner — schedule still valid
  Given a new agent is added to the AGENTS list in autonomousRunner.js
  And the new agent exposes runAutonomous()
  When the hourly driver runs
  Then the new agent produces its artifact
  And check-schedules.js still reports all schedules as OK

### Scenario: Schedule manifest is the single source of truth
  Given the schedules.json manifest exists
  When any engine component needs the list of required schedules
  Then it reads schedules.json
  And it does not hardcode schedule ids elsewhere
