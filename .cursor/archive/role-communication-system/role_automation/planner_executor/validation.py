"""
Plan Validation Module

This module provides functions for validating plans and execution results.
It ensures that plans are well-formed and executable, and that execution
results meet the requirements specified in the plan.
"""

import logging
from typing import Dict, List, Any, Tuple, NamedTuple

logger = logging.getLogger(__name__)

class ValidationResult(NamedTuple):
    """Result of a validation operation."""
    is_valid: bool
    message: str
    issues: List[str]

def validate_plan(plan: Dict[str, Any]) -> Tuple[bool, str, List[str]]:
    """
    Validate that a plan is well-formed and executable.
    
    Args:
        plan (Dict[str, Any]): The plan to validate
        
    Returns:
        Tuple[bool, str, List[str]]: (is_valid, message, issues)
    """
    issues = []
    
    # Check required fields
    required_fields = ["id", "description", "steps", "role_assignments", "dependencies", "available_roles"]
    for field in required_fields:
        if field not in plan:
            issues.append(f"Missing required field: {field}")
    
    if issues:
        return False, "Plan is missing required fields", issues
    
    # Check steps
    if not plan["steps"]:
        issues.append("Plan has no steps")
    
    for i, step in enumerate(plan["steps"]):
        step_issues = _validate_step(step, i + 1)
        issues.extend(step_issues)
    
    # Check role assignments
    for role_id, step_ids in plan["role_assignments"].items():
        if role_id not in plan["available_roles"]:
            issues.append(f"Role {role_id} is assigned but not available")
        
        for step_id in step_ids:
            step = next((s for s in plan["steps"] if s["id"] == step_id), None)
            if not step:
                issues.append(f"Role {role_id} is assigned to non-existent step {step_id}")
    
    # Check dependencies
    for step in plan["steps"]:
        for dep_id in step.get("dependencies", []):
            dep_step = next((s for s in plan["steps"] if s["id"] == dep_id), None)
            if not dep_step:
                issues.append(f"Step {step['id']} depends on non-existent step {dep_id}")
    
    # Check for circular dependencies
    circular_deps = _check_circular_dependencies(plan)
    if circular_deps:
        issues.append(f"Circular dependencies detected: {circular_deps}")
    
    # Check that all steps are assigned
    unassigned_steps = [s["id"] for s in plan["steps"] if not s.get("assigned_role")]
    if unassigned_steps:
        issues.append(f"Unassigned steps: {', '.join(unassigned_steps)}")
    
    # Final validation result
    if issues:
        return False, "Plan validation failed", issues
    
    return True, "Plan is valid", []

def _validate_step(step: Dict[str, Any], index: int) -> List[str]:
    """
    Validate a single step in a plan.
    
    Args:
        step (Dict[str, Any]): The step to validate
        index (int): The index of the step in the plan
        
    Returns:
        List[str]: List of validation issues
    """
    issues = []
    
    # Check required fields
    required_fields = ["id", "description", "acceptance_criteria"]
    for field in required_fields:
        if field not in step:
            issues.append(f"Step {index} is missing required field: {field}")
    
    if "acceptance_criteria" in step and not step["acceptance_criteria"]:
        issues.append(f"Step {index} has empty acceptance criteria")
    
    return issues

def _check_circular_dependencies(plan: Dict[str, Any]) -> str:
    """
    Check for circular dependencies in a plan.
    
    Args:
        plan (Dict[str, Any]): The plan to check
        
    Returns:
        str: Description of circular dependencies or empty string if none
    """
    # Build dependency graph
    graph = {}
    for step in plan["steps"]:
        step_id = step["id"]
        graph[step_id] = step.get("dependencies", [])
    
    # Check for cycles
    visited = set()
    path = []
    
    def dfs(node):
        if node in path:
            cycle = " -> ".join(path[path.index(node):] + [node])
            return cycle
        
        if node in visited:
            return ""
        
        visited.add(node)
        path.append(node)
        
        for neighbor in graph.get(node, []):
            cycle = dfs(neighbor)
            if cycle:
                return cycle
        
        path.pop()
        return ""
    
    for node in graph:
        cycle = dfs(node)
        if cycle:
            return cycle
    
    return ""

def validate_execution(plan: Dict[str, Any], execution_results: Dict[str, Dict[str, Any]]) -> ValidationResult:
    """
    Validate that execution results meet the requirements specified in the plan.
    
    Args:
        plan (Dict[str, Any]): The plan containing requirements
        execution_results (Dict[str, Dict[str, Any]]): Results of execution (step_id -> result)
        
    Returns:
        ValidationResult: Validation result
    """
    issues = []
    
    # Check that all steps have execution results
    for step in plan["steps"]:
        step_id = step["id"]
        if step_id not in execution_results:
            issues.append(f"Missing execution result for step {step_id}")
            continue
        
        result = execution_results[step_id]
        
        # Check that execution was successful
        if not result.get("success", False):
            issues.append(f"Step {step_id} execution failed: {result.get('message', 'No message')}")
            continue
        
        # Check that all acceptance criteria are met
        if "acceptance_criteria" in step:
            for criterion in step["acceptance_criteria"]:
                if not _meets_criterion(result, criterion):
                    issues.append(f"Step {step_id} failed acceptance criterion: {criterion}")
    
    # Final validation result
    if issues:
        return ValidationResult(
            is_valid=False,
            message="Execution validation failed",
            issues=issues
        )
    
    return ValidationResult(
        is_valid=True,
        message="Execution results are valid",
        issues=[]
    )

def _meets_criterion(result: Dict[str, Any], criterion: str) -> bool:
    """
    Check if an execution result meets a specific acceptance criterion.
    
    Args:
        result (Dict[str, Any]): The execution result
        criterion (str): The acceptance criterion
        
    Returns:
        bool: True if the criterion is met, False otherwise
    """
    # This is a simple implementation that checks if the criterion is mentioned
    # in the result artifacts or output. A more sophisticated implementation
    # would parse the criterion and check it against the result in a structured way.
    
    # Check if criterion is explicitly marked as met
    if "met_criteria" in result and criterion in result["met_criteria"]:
        return True
    
    # Check if criterion is mentioned in artifacts
    if "artifacts" in result:
        for artifact in result["artifacts"]:
            if isinstance(artifact, str) and criterion.lower() in artifact.lower():
                return True
            elif isinstance(artifact, dict) and "description" in artifact:
                if criterion.lower() in artifact["description"].lower():
                    return True
    
    # Check if criterion is mentioned in output
    if "output" in result and isinstance(result["output"], str):
        if criterion.lower() in result["output"].lower():
            return True
    
    # Default to False if no evidence that criterion is met
    return False 