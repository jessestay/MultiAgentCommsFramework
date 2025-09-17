# PRIVATE - FOR LOCAL PROCESSING ONLY

# Health Directory

This directory contains private health-related information for the user. This information is highly sensitive and must only be processed by local LLMs.

## Directory Structure

```
health/
  ├── conditions/         # Information about health conditions
  ├── medications/        # Medication information and schedules
  ├── accommodations/     # Health-related accommodations
  ├── tracking/           # Health tracking data
  │   ├── YYYY-MM/        # Organized by month
  └── README.md           # This file
```

## Health Information Format

Health information should be stored in markdown files with appropriate naming conventions.

### Condition Format

```markdown
# Condition: [Condition Name]

## Details
- **Diagnosis Date:** YYYY-MM-DD
- **Diagnosing Provider:** [Provider name]
- **Status:** [Active/Managed/Resolved]
- **Severity:** [Mild/Moderate/Severe]

## Description
[Detailed description of the condition]

## Symptoms
- [Symptom 1]
- [Symptom 2]
- [Symptom 3]

## Triggers
- [Trigger 1]
- [Trigger 2]
- [Trigger 3]

## Management Strategies
- [Strategy 1]
- [Strategy 2]
- [Strategy 3]

## Medications
- [Medication 1]
- [Medication 2]

## Impact on Daily Life
[Description of how this condition impacts daily activities]

## Accommodations Needed
- [Accommodation 1]
- [Accommodation 2]
- [Accommodation 3]

## Notes
[Any additional notes or context]

## Updates
- YYYY-MM-DD: [Update note]
```

### Medication Format

```markdown
# Medication: [Medication Name]

## Details
- **Started:** YYYY-MM-DD
- **Dosage:** [Dosage information]
- **Schedule:** [When taken]
- **Prescribing Provider:** [Provider name]
- **For Condition:** [Related condition]

## Purpose
[Why this medication is taken]

## Effects
- **Intended Effects:** [What it's supposed to do]
- **Side Effects:** [Experienced side effects]
- **Onset Time:** [How long it takes to work]
- **Duration:** [How long effects last]

## Instructions
[Special instructions for taking this medication]

## Interactions
- [Interaction 1]
- [Interaction 2]

## Notes
[Any additional notes or context]

## Updates
- YYYY-MM-DD: [Update note]
```

## Privacy and Security

This directory contains highly sensitive personal health information (PHI) that must be protected:

1. **NEVER process these files with cloud-based LLMs** like Claude
2. **ONLY use local LLMs** (e.g., Ollama) to process this information
3. Ensure all files have appropriate access controls
4. Regularly audit access to these files
5. Encrypt this directory if possible

## Integration with User Context

Health information may inform accommodations and preferences in the public user context, but specific details should remain private. General accommodations derived from health information can be included in the public profile without revealing specific health conditions. 