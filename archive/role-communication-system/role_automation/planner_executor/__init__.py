"""
Planner-Executor Architecture for AI Role Communication Automation System.

This package implements a formal planning and execution architecture inspired by
the devin.cursorrules project. It separates planning and execution concerns,
allowing for more structured task management and role coordination.

Components:
- PlannerRole: Base class for roles that create and manage plans
- ExecutorRole: Base class for roles that execute specific tasks
- Validation: Utilities for validating plans and execution results
"""

from role_automation.planner_executor.planner_role import PlannerRole
from role_automation.planner_executor.executor_role import ExecutorRole
from role_automation.planner_executor.validation import (
    validate_plan,
    validate_execution,
    ValidationResult
)

__all__ = [
    'PlannerRole',
    'ExecutorRole',
    'validate_plan',
    'validate_execution',
    'ValidationResult'
] 