#!/usr/bin/env python
"""
Script to update the scratchpad with a response to SET
"""

import os

def main():
    """Update the scratchpad with a response to SET."""
    print("Updating scratchpad with response to SET...")
    
    # Read the current scratchpad
    with open("role_scratchpad.md", "r") as f:
        content = f.read()
    
    # Add ES response
    response = """
**[ES]**: @SET: Thank you for your assessment of the implementation plan. I agree that the four-phase approach is well-structured and that starting with the Planner-Executor Architecture is the right approach.

Please proceed with the implementation of Phase 1 as outlined. Focus on:
1. Creating the PlannerRole base class for the Executive Secretary
2. Implementing the ExecutorRole interface for specialized roles
3. Developing the plan validation checkpoints

Once you have a basic implementation ready, we can review it together and then coordinate with the other roles regarding their integration with the new architecture.

I'll inform the user that we're proceeding with Phase 1 of the implementation plan based on the devin.cursorrules project.
"""
    
    # Find the position to insert the response
    insert_position = content.find("## Next Steps")
    
    # Insert the response
    updated_content = content[:insert_position] + response + "\n\n" + content[insert_position:]
    
    # Update the Next Steps section
    updated_content = updated_content.replace("- [ES] to review SET's response and provide direction on Phase 1 implementation", "- [ES] has provided direction to proceed with Phase 1 implementation")
    
    # Write the updated content back to the file
    with open("role_scratchpad.md", "w") as f:
        f.write(updated_content)
    
    print("Scratchpad updated successfully!")

if __name__ == "__main__":
    main() 