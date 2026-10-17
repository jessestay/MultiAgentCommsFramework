# Planner-Executor Architecture

The Planner-Executor Architecture is a framework for coordinating complex tasks across multiple specialized roles. It provides a structured approach to planning, assigning, and executing tasks, with built-in mechanisms for tracking progress and managing dependencies.

## Core Components

### PlannerRole

The `PlannerRole` class is responsible for creating and managing plans. It provides methods for:

- Creating new plans
- Adding steps to plans
- Assigning roles to steps
- Adding dependencies between steps
- Finalizing plans
- Tracking plan progress

### ExecutorRole

The `ExecutorRole` interface is implemented by specialized roles to execute specific tasks. It provides methods for:

- Retrieving assigned tasks
- Executing tasks
- Reporting progress
- Requesting clarification

### Adapters

The architecture includes adapters to integrate with existing systems:

- `StorageAdapter`: Provides methods for storing and retrieving plans, conversations, and messages
- `MessageAdapter`: Provides methods for routing messages between roles

## Usage

### Creating a Plan

```python
from role_automation.planner_executor.es_planner import ExecutiveSecretaryPlanner
from role_automation.planner_executor.storage_adapter import StorageAdapter
from role_automation.planner_executor.message_adapter import MessageAdapter

# Initialize adapters
storage_adapter = StorageAdapter(storage_manager, message_router)
message_adapter = MessageAdapter(message_router, storage_adapter)

# Initialize planner
es_planner = ExecutiveSecretaryPlanner(storage_adapter, message_adapter)

# Create a plan
plan = es_planner.create_plan(
    "Project Title",
    ["ES", "ROLE1", "ROLE2"]  # Available roles
)

# Add steps to the plan
plan = es_planner.add_step(
    plan,
    "Step description",
    ["Acceptance criterion 1", "Acceptance criterion 2"],
    estimated_effort=2
)

# Add dependencies between steps
plan = es_planner.add_dependency(plan, "step_2", "step_1")  # step_2 depends on step_1

# Assign roles to steps
plan = es_planner.assign_role(plan, "step_1", "ROLE1")

# Finalize the plan
plan = es_planner.finalize_plan(plan)
```

### Implementing an Executor Role

```python
from role_automation.planner_executor.executor_role import ExecutorRole

class SpecializedRoleExecutor(ExecutorRole):
    """Specialized role implementation of the ExecutorRole."""
    
    def execute_step(self, plan_id: str, step_id: str, context=None):
        """Execute a specific step assigned to this role."""
        # Call the base implementation to handle common logic
        result = super().execute_step(plan_id, step_id, context)
        
        if not result["success"]:
            return result
        
        # Get the plan and step
        plan = self._retrieve_plan(plan_id)
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        
        # Implement role-specific logic here
        artifacts = []
        
        # Create artifacts based on the step
        artifacts.append({
            "type": "document",
            "title": "Document Title",
            "content": "Document content",
            "url": "https://example.com/document"
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

### Executing a Plan

```python
# Initialize role executors
role1_executor = Role1Executor("ROLE1", storage_adapter, message_adapter)
role2_executor = Role2Executor("ROLE2", storage_adapter, message_adapter)

# Get tasks for each role
role1_tasks = role1_executor.get_assigned_tasks()
role2_tasks = role2_executor.get_assigned_tasks()

# Execute steps in dependency order
for step in plan["steps"]:
    step_id = step["id"]
    role = step["assigned_role"]
    
    if role == "ROLE1":
        result = role1_executor.execute_step(plan["id"], step_id)
    elif role == "ROLE2":
        result = role2_executor.execute_step(plan["id"], step_id)
    
    # Get updated plan
    plan = es_planner.get_plan(plan["id"])
```

## Example Use Cases

The Planner-Executor Architecture can be used for various scenarios:

1. **Content Marketing Campaigns**: Plan and execute content creation, review, and promotion tasks across multiple roles.
2. **Product Development**: Coordinate design, development, testing, and deployment tasks.
3. **Client Projects**: Manage client onboarding, service delivery, and follow-up tasks.
4. **Event Planning**: Coordinate venue selection, speaker management, promotion, and logistics.

## Best Practices

1. **Clear Step Descriptions**: Provide clear and specific descriptions for each step.
2. **Detailed Acceptance Criteria**: Define specific acceptance criteria for each step to ensure quality.
3. **Appropriate Role Assignment**: Assign steps to roles based on their expertise and responsibilities.
4. **Proper Dependencies**: Ensure that dependencies between steps are correctly defined.
5. **Regular Progress Updates**: Encourage executors to provide regular progress updates.
6. **Artifact Documentation**: Document artifacts produced by each step for reference.

## Integration with Existing Systems

The Planner-Executor Architecture is designed to integrate with existing systems through adapters. The `StorageAdapter` and `MessageAdapter` classes provide the necessary interfaces for integration.

To integrate with a new system:

1. Implement a custom adapter that translates between the Planner-Executor Architecture and the target system.
2. Initialize the adapter with the appropriate system components.
3. Use the adapter in the planner and executor classes.

## Error Handling

The architecture includes built-in error handling mechanisms:

1. **Validation**: Plans and steps are validated before execution.
2. **Error Reporting**: Errors during execution are reported and logged.
3. **Clarification Requests**: Executors can request clarification if needed.
4. **Progress Tracking**: Progress is tracked and reported for each step.

## Extending the Architecture

The architecture can be extended in various ways:

1. **Custom Planners**: Implement custom planner classes for specific use cases.
2. **Specialized Executors**: Implement specialized executor classes for specific roles.
3. **Additional Validation**: Add custom validation rules for plans and steps.
4. **Enhanced Reporting**: Implement enhanced reporting mechanisms for plan progress.
5. **Integration with External Systems**: Integrate with external systems for task management, communication, or reporting.

## Conclusion

The Planner-Executor Architecture provides a flexible and extensible framework for coordinating complex tasks across multiple specialized roles. By separating planning and execution concerns, it enables efficient collaboration and task management. 