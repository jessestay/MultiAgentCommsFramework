# Using the Planner-Executor Architecture with Specialized Roles

This guide explains how to use the Planner-Executor Architecture to coordinate tasks across specialized roles in the AI Role Communication Automation System.

## Overview

The Planner-Executor Architecture provides a structured approach to planning and executing complex tasks across multiple specialized roles. The Executive Secretary (ES) acts as the planner, creating and managing plans, while specialized roles like Business Income Coach (BIC), Marketing Director (MD), and Social Media Manager (SMM) act as executors, carrying out specific tasks assigned to them.

## Getting Started

### Prerequisites

- Python 3.8 or higher
- The AI Role Communication Automation System installed
- Access to the specialized roles you want to use

### Basic Workflow

1. **Create a Plan**: The Executive Secretary creates a plan with specific steps, acceptance criteria, and role assignments.
2. **Assign Tasks**: Tasks are assigned to specialized roles based on their expertise and responsibilities.
3. **Execute Tasks**: Specialized roles execute their assigned tasks, reporting progress and producing artifacts.
4. **Monitor Progress**: The Executive Secretary monitors progress and adapts the plan as needed.
5. **Review Results**: The completed plan and its artifacts are reviewed for quality and completeness.

## Creating a Plan

To create a plan, use the `ExecutiveSecretaryPlanner` class:

```python
from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter
from role_automation.planner_executor.storage_adapter import StorageAdapter
from role_automation.planner_executor.message_adapter import MessageAdapter
from role_automation.planner_executor.es_planner import ExecutiveSecretaryPlanner

# Initialize system components
security_manager = SecurityManager()
storage_manager = StorageManager(security_manager)
message_router = MessageRouter(security_manager, storage_manager)

# Initialize adapters
storage_adapter = StorageAdapter(storage_manager, message_router)
message_adapter = MessageAdapter(message_router, storage_adapter)

# Initialize Executive Secretary planner
es_planner = ExecutiveSecretaryPlanner(storage_adapter, message_adapter)

# Create a plan
plan = es_planner.create_plan(
    "Content Marketing Campaign for Product Launch",
    ["ES", "BIC", "MD", "SMM", "CTW"]  # Available roles
)

# Add steps to the plan
plan = es_planner.add_step(
    plan,
    "Develop content strategy and goals",
    ["Target audience defined", "Content goals established", "KPIs identified"],
    2  # Estimated effort
)

# Add more steps as needed
plan = es_planner.add_step(
    plan,
    "Research target market and competitors",
    ["Market analysis completed", "Competitor strengths identified", "Opportunities documented"],
    3
)

# Add dependencies between steps
plan = es_planner.add_dependency(plan, "step_2", "step_1")  # step_2 depends on step_1

# Assign roles to steps
plan = es_planner.assign_role(plan, "step_1", "MD")  # Marketing Director handles strategy
plan = es_planner.assign_role(plan, "step_2", "BIC")  # Business Income Coach handles research

# Finalize the plan
plan = es_planner.finalize_plan(plan)
```

## Implementing Specialized Role Executors

Each specialized role needs an executor implementation that inherits from the `ExecutorRole` class:

```python
from role_automation.planner_executor.executor_role import ExecutorRole

class BusinessIncomeCoachExecutor(ExecutorRole):
    """Business Income Coach implementation of the ExecutorRole."""
    
    def execute_step(self, plan_id: str, step_id: str, context=None):
        """Execute a specific step assigned to the Business Income Coach."""
        # Call the base implementation to handle common logic
        result = super().execute_step(plan_id, step_id, context)
        
        if not result["success"]:
            return result
        
        # Get the plan and step
        plan = self._retrieve_plan(plan_id)
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        
        # Implement BIC-specific logic here
        artifacts = []
        
        if "research" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Market Research Report",
                "content": "Comprehensive analysis of the target market and competitors.",
                "url": "https://example.com/bic/research"
            })
        elif "financial" in step["description"].lower():
            artifacts.append({
                "type": "spreadsheet",
                "title": "Financial Projections",
                "content": "Detailed financial projections for the product launch.",
                "url": "https://example.com/bic/financials"
            })
        
        # Report progress
        self.report_progress(
            plan_id, 
            step_id, 
            "completed", 
            1.0, 
            artifacts,
            f"Completed: {step['description']}"
        )
        
        return {
            "success": True,
            "message": f"Step {step_id} executed successfully",
            "status": "completed",
            "artifacts": artifacts
        }
```

Implement similar executor classes for other specialized roles like `MarketingDirectorExecutor`, `SocialMediaManagerExecutor`, etc.

## Executing a Plan

To execute a plan, initialize the executor classes for each specialized role and execute their assigned tasks:

```python
# Initialize role executors
bic_executor = BusinessIncomeCoachExecutor("BIC", storage_adapter, message_adapter)
md_executor = MarketingDirectorExecutor("MD", storage_adapter, message_adapter)
smm_executor = SocialMediaManagerExecutor("SMM", storage_adapter, message_adapter)
ctw_executor = ContentTechnicalWriterExecutor("CTW", storage_adapter, message_adapter)

# Get tasks for each role
bic_tasks = bic_executor.get_assigned_tasks()
md_tasks = md_executor.get_assigned_tasks()
smm_tasks = smm_executor.get_assigned_tasks()
ctw_tasks = ctw_executor.get_assigned_tasks()

# Execute steps in dependency order
for step_num in range(1, len(plan["steps"]) + 1):
    step_id = f"step_{step_num}"
    step = next((s for s in plan["steps"] if s["id"] == step_id), None)
    
    if not step:
        continue
    
    role = step["assigned_role"]
    
    if role == "BIC":
        result = bic_executor.execute_step(plan["id"], step_id)
    elif role == "MD":
        result = md_executor.execute_step(plan["id"], step_id)
    elif role == "SMM":
        result = smm_executor.execute_step(plan["id"], step_id)
    elif role == "CTW":
        result = ctw_executor.execute_step(plan["id"], step_id)
    
    # Get updated plan
    plan = es_planner.get_plan(plan["id"])
```

## Example Use Cases

### Content Marketing Campaign

```python
# Create a plan for a content marketing campaign
plan = es_planner.create_plan(
    "Expert Guide to AI Implementation in Business",
    ["ES", "CTW", "MD", "SMM"]
)

# Add steps for strategy, content creation, and promotion
plan = es_planner.add_step(plan, "Develop content strategy and goals", [...], 2)
plan = es_planner.add_step(plan, "Research AI implementation case studies", [...], 3)
plan = es_planner.add_step(plan, "Create detailed content outline", [...], 2)
plan = es_planner.add_step(plan, "Write first draft of the guide", [...], 4)
plan = es_planner.add_step(plan, "Review and provide feedback on draft", [...], 2)
plan = es_planner.add_step(plan, "Revise and finalize content", [...], 3)
plan = es_planner.add_step(plan, "Create social media promotion plan", [...], 2)
plan = es_planner.add_step(plan, "Develop social media assets", [...], 3)
plan = es_planner.add_step(plan, "Publish and promote content", [...], 2)

# Assign roles
plan = es_planner.assign_role(plan, "step_1", "MD")  # Strategy to MD
plan = es_planner.assign_role(plan, "step_2", "CTW")  # Research to CTW
plan = es_planner.assign_role(plan, "step_3", "CTW")  # Outline to CTW
plan = es_planner.assign_role(plan, "step_4", "CTW")  # Draft to CTW
plan = es_planner.assign_role(plan, "step_5", "MD")   # Review to MD
plan = es_planner.assign_role(plan, "step_6", "CTW")  # Revise to CTW
plan = es_planner.assign_role(plan, "step_7", "SMM")  # Promotion plan to SMM
plan = es_planner.assign_role(plan, "step_8", "SMM")  # Social assets to SMM
plan = es_planner.assign_role(plan, "step_9", "SMM")  # Publish to SMM
```

### Client Onboarding Process

```python
# Create a plan for client onboarding
plan = es_planner.create_plan(
    "New Client Onboarding: ABC Corporation",
    ["ES", "BIC", "UFL", "DLC"]
)

# Add steps for onboarding process
plan = es_planner.add_step(plan, "Initial client consultation", [...], 2)
plan = es_planner.add_step(plan, "Financial situation assessment", [...], 3)
plan = es_planner.add_step(plan, "Legal document review", [...], 4)
plan = es_planner.add_step(plan, "Debt analysis and strategy", [...], 3)
plan = es_planner.add_step(plan, "Develop comprehensive action plan", [...], 4)
plan = es_planner.add_step(plan, "Present recommendations to client", [...], 2)

# Assign roles
plan = es_planner.assign_role(plan, "step_1", "ES")   # Initial consultation to ES
plan = es_planner.assign_role(plan, "step_2", "BIC")  # Financial assessment to BIC
plan = es_planner.assign_role(plan, "step_3", "UFL")  # Legal review to UFL
plan = es_planner.assign_role(plan, "step_4", "DLC")  # Debt analysis to DLC
plan = es_planner.assign_role(plan, "step_5", "BIC")  # Action plan to BIC
plan = es_planner.assign_role(plan, "step_6", "ES")   # Presentation to ES
```

## Best Practices

1. **Clear Step Descriptions**: Provide clear and specific descriptions for each step.
2. **Detailed Acceptance Criteria**: Define specific acceptance criteria for each step to ensure quality.
3. **Appropriate Role Assignment**: Assign steps to roles based on their expertise and responsibilities.
4. **Proper Dependencies**: Ensure that dependencies between steps are correctly defined.
5. **Regular Progress Updates**: Encourage executors to provide regular progress updates.
6. **Artifact Documentation**: Document artifacts produced by each step for reference.

## Troubleshooting

### Common Issues

1. **Missing Dependencies**: If a step cannot be executed because its dependencies are not completed, check the dependency chain and ensure all prerequisite steps are completed.

2. **Role Assignment Errors**: If a role cannot execute a step, ensure that the role has the necessary permissions and capabilities for the task.

3. **Storage Errors**: If plans or artifacts cannot be stored or retrieved, check the storage adapter configuration and ensure the storage manager is properly initialized.

4. **Message Routing Errors**: If messages are not being properly routed between roles, check the message adapter configuration and ensure the message router is properly initialized.

## Conclusion

The Planner-Executor Architecture provides a powerful framework for coordinating complex tasks across specialized roles in the AI Role Communication Automation System. By following this guide, you can effectively plan and execute tasks, leveraging the expertise of each specialized role to achieve your goals. 