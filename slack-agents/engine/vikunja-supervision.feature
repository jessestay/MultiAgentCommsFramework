# Vikunja Supervision — BDD Scenarios
#
# Jesse's law (Oct 10, 2026): "The watchdog and auto healer that should be
# part of the MACF should have detected this, and BDD and TDD should have
# alerted that it wasn't."
#
# ROOT CAUSE (Oct 10, 2026): Vikunja died silently three times. The watchdog
# HAD a liveness probe and restart logic, but start.sh used `nohup ... &`.
# The runtime kills the entire process group on session teardown — nohup
# cannot escape. Every restart died again hours later. Fixed with setsid.

## Feature: Vikunja stays alive under watchdog supervision

### Scenario: Vikunja dies — watchdog detects and restarts it
  Given Vikunja is not responding on 127.0.0.1:3456
  When the watchdog runs its liveness probe
  Then it detects the failure
  And it kills any stale Vikunja process with an anchored pkill
  And it runs start.sh to relaunch Vikunja
  And Vikunja responds on 127.0.0.1:3456 within 10 seconds

### Scenario: Vikunja restart survives session teardown
  Given Vikunja was started by start.sh
  When the parent exec session terminates
  Then Vikunja continues running
  And it still responds on 127.0.0.1:3456
  # (This is the setsid invariant — bare nohup fails this scenario.)

### Scenario: Vikunja is healthy — watchdog does not restart it
  Given Vikunja is responding on 127.0.0.1:3456
  When the watchdog runs its liveness probe
  Then it does NOT kill or restart Vikunja
  And start.sh exits 0 immediately (idempotent probe-first)

### Scenario: Watchdog never kills itself with pkill
  Given the watchdog is running
  When it executes the Vikunja restart sequence
  Then the pkill pattern is anchored with ^
  And the watchdog's own process is not matched
  And the watchdog completes its run
