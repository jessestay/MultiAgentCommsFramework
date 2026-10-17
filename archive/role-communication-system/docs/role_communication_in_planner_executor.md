# Role Communication in the Planner-Executor Architecture

This document explains how role communication works in the Planner-Executor Architecture and clarifies the difference between simulated role interactions and actual conversations with specialized roles.

## Understanding Role Communication

### Simulated vs. Actual Role Conversations

The Planner-Executor Architecture as implemented in the `use_planner_executor.py` example uses **simulated role interactions** rather than actual conversations with specialized roles. Here's what this means:

1. **Simulated Role Interactions**: 
   - The executor classes (like `ContentTechnicalWriterExecutor`) simulate the behavior of specialized roles.
   - These classes programmatically generate artifacts and progress reports based on the task descriptions.
   - The system creates conversation records in the storage system to track these interactions.
   - No actual AI model for each role is involved in generating responses.

2. **Actual Role Conversations**:
   - In contrast, actual role conversations would involve directly addressing specialized roles (e.g., "@BIC: Can you analyze this financial data?").
   - Each role would have its own AI model that responds based on its expertise and character.
   - The responses would be generated dynamically rather than programmatically.

## How Communication Works in the Current Implementation

In the current implementation, communication between roles works as follows:

1. **Plan Creation and Notification**:
   - The Executive Secretary (ES) creates a plan with steps assigned to specific roles.
   - When the plan is finalized, the system sends notifications to the assigned roles through the message router.
   - These notifications are stored as conversation records in the storage system.

2. **Task Execution**:
   - The executor classes simulate the execution of tasks by specialized roles.
   - They generate artifacts and progress reports based on the task descriptions.
   - These reports are stored as messages in the conversation records.

3. **Progress Monitoring**:
   - The ES monitors progress by checking the status of steps in the plan.
   - The system updates the plan status based on the progress reports from the executor classes.

## Implementing Actual Role Conversations

To implement actual conversations with specialized roles, you would need to:

1. **Create Role-Specific AI Models**:
   - Implement AI models for each specialized role (BIC, MD, SMM, etc.).
   - Train or configure these models to respond in character based on their expertise and responsibilities.

2. **Implement a Direct Communication Interface**:
   - Create a user interface that allows you to directly address specialized roles.
   - This could be a command-line interface, chat interface, or web application.

3. **Enhance the Message Router**:
   - Modify the message router to route messages to the appropriate role-specific AI model.
   - Ensure that the communication protocol is maintained (e.g., "[SOURCE_ROLE]: @TARGET_ROLE: Message content").

4. **Integrate with the Planner-Executor Architecture**:
   - Connect the direct communication system with the Planner-Executor Architecture.
   - Ensure that conversations can influence and be influenced by plans.

## Example of Actual Role Conversation

Here's an example of what an actual role conversation might look like:

```
User: @ES: I need a content marketing campaign for our new product launch.

[ES]: I'll help you create a content marketing campaign for your product launch. Let me coordinate with our specialized roles to develop a comprehensive plan.

[ES]: @MD: We need to develop a content marketing strategy for a new product launch. Can you outline the key objectives and target audience?

[MD]: @ES: I'll work on the content marketing strategy. What's the product and when is the launch date?

User: The product is a new AI-powered productivity tool, launching in 3 months.

[ES]: @MD: The product is a new AI-powered productivity tool with a launch date in 3 months.

[MD]: @ES: Thanks for the information. I'll develop a content strategy focused on highlighting the AI capabilities and productivity benefits. I'll have a draft ready by tomorrow.

[ES]: @CTW: Once we have the strategy from the Marketing Director, we'll need you to create content for the product launch. Can you start researching AI productivity tools in the market?

[CTW]: @ES: I'll begin researching AI productivity tools right away. I'll focus on identifying key features, benefits, and market trends to inform our content creation.
```

In this example, each role has its own AI model that generates responses based on its expertise and character. The conversation flows naturally between the user, the Executive Secretary, and the specialized roles.

## Conclusion

The current implementation of the Planner-Executor Architecture uses simulated role interactions rather than actual conversations with specialized roles. While this approach is effective for demonstrating the architecture and executing plans, it doesn't provide the experience of directly conversing with specialized roles.

To implement actual role conversations, you would need to create role-specific AI models and enhance the communication system to route messages to these models. This would provide a more interactive and dynamic experience, allowing you to directly engage with specialized roles and leverage their expertise in real-time conversations. 