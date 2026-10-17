#!/usr/bin/env python
"""
Demonstration of the Planner-Executor Architecture with Adapters

This script demonstrates the complete workflow of the Planner-Executor architecture
using adapters to connect with the existing system:
1. The Executive Secretary creates a plan
2. Tasks are assigned to specialized roles
3. Specialized roles execute tasks and report progress
4. The Executive Secretary monitors progress and finalizes the plan
"""

import os
import sys
import time
import logging
import datetime
from typing import Dict, List, Any

# Add parent directory to path to import role_automation modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter
from role_automation.planner_executor.storage_adapter import StorageAdapter
from role_automation.planner_executor.message_adapter import MessageAdapter
from role_automation.planner_executor.es_planner import ExecutiveSecretaryPlanner
from role_automation.planner_executor.executor_role import ExecutorRole

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('planner_executor_demo_with_adapters.log')
    ]
)

logger = logging.getLogger(__name__)

class MarketingDirectorExecutor(ExecutorRole):
    """Marketing Director implementation of the ExecutorRole."""
    
    def execute_step(self, plan_id: str, step_id: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Execute a specific step from a plan.
        
        Args:
            plan_id (str): The ID of the plan containing the step
            step_id (str): The ID of the step to execute
            context (Dict[str, Any], optional): Additional context for execution
            
        Returns:
            Dict[str, Any]: Execution result
        """
        # Call the base implementation to handle common logic
        result = super().execute_step(plan_id, step_id, context)
        
        if not result["success"]:
            return result
        
        # Get the plan and step
        plan = self._retrieve_plan(plan_id)
        if not plan:
            return {"success": False, "message": f"Plan {plan_id} not found"}
        
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        if not step:
            return {"success": False, "message": f"Step {step_id} not found in plan {plan_id}"}
        
        # Simulate execution based on step description
        logger.info(f"Marketing Director executing step: {step['description']}")
        
        # Simulate work being done
        time.sleep(1)
        
        # Create artifacts based on step
        artifacts = []
        if "objectives" in step["description"].lower() or "audience" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Campaign Objectives and Target Audience",
                "content": "This document outlines the SMART objectives for the campaign and defines the target audience.",
                "url": "https://example.com/campaign/objectives"
            })
        elif "strategy" in step["description"].lower() or "messaging" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Campaign Strategy and Messaging",
                "content": "This document outlines the marketing strategy and key messaging for the campaign.",
                "url": "https://example.com/campaign/strategy"
            })
        elif "assets" in step["description"].lower():
            artifacts.append({
                "type": "image",
                "title": "Campaign Banner",
                "content": "Banner image for the campaign.",
                "url": "https://example.com/campaign/banner.jpg"
            })
            artifacts.append({
                "type": "document",
                "title": "Campaign Copy",
                "content": "Copy for the campaign across all channels.",
                "url": "https://example.com/campaign/copy"
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

class SocialMediaManagerExecutor(ExecutorRole):
    """Social Media Manager implementation of the ExecutorRole."""
    
    def execute_step(self, plan_id: str, step_id: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Execute a specific step from a plan.
        
        Args:
            plan_id (str): The ID of the plan containing the step
            step_id (str): The ID of the step to execute
            context (Dict[str, Any], optional): Additional context for execution
            
        Returns:
            Dict[str, Any]: Execution result
        """
        # Call the base implementation to handle common logic
        result = super().execute_step(plan_id, step_id, context)
        
        if not result["success"]:
            return result
        
        # Get the plan and step
        plan = self._retrieve_plan(plan_id)
        if not plan:
            return {"success": False, "message": f"Plan {plan_id} not found"}
        
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        if not step:
            return {"success": False, "message": f"Step {step_id} not found in plan {plan_id}"}
        
        # Simulate execution based on step description
        logger.info(f"Social Media Manager executing step: {step['description']}")
        
        # Simulate work being done
        time.sleep(1)
        
        # Create artifacts based on step
        artifacts = []
        if "launch" in step["description"].lower():
            artifacts.append({
                "type": "link",
                "title": "Facebook Campaign",
                "content": "Link to the launched Facebook campaign.",
                "url": "https://facebook.com/campaign"
            })
            artifacts.append({
                "type": "link",
                "title": "Twitter Campaign",
                "content": "Link to the launched Twitter campaign.",
                "url": "https://twitter.com/campaign"
            })
        elif "monitor" in step["description"].lower() or "optimize" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Campaign Performance Report",
                "content": "This report shows the performance of the campaign across all channels.",
                "url": "https://example.com/campaign/performance"
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

def run_demo():
    """Run the Planner-Executor demonstration with adapters."""
    logger.info("Starting Planner-Executor demonstration with adapters")
    
    # Initialize system components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Initialize adapters
    storage_adapter = StorageAdapter(storage_manager, message_router)
    message_adapter = MessageAdapter(message_router, storage_adapter)
    
    # Initialize roles with adapters
    es_planner = ExecutiveSecretaryPlanner(storage_adapter, message_adapter)
    md_executor = MarketingDirectorExecutor("MD", storage_adapter, message_adapter)
    smm_executor = SocialMediaManagerExecutor("SMM", storage_adapter, message_adapter)
    
    # Step 1: Executive Secretary creates a plan
    logger.info("Step 1: Executive Secretary creates a plan")
    plan = es_planner.create_plan(
        "Create a social media campaign for product launch",
        ["ES", "MD", "SMM"]
    )
    
    # Step 2: Add steps to the plan
    logger.info("Step 2: Add steps to the plan")
    plan = es_planner.add_step(
        plan,
        "Define campaign objectives and target audience",
        ["Objectives are SMART", "Target audience is clearly defined", "Success metrics established"],
        2
    )
    
    plan = es_planner.add_step(
        plan,
        "Develop campaign strategy and messaging",
        ["Strategy aligns with objectives", "Messaging is compelling", "Brand guidelines followed"],
        3
    )
    
    plan = es_planner.add_step(
        plan,
        "Create campaign assets",
        ["All required assets created", "Assets follow brand guidelines", "Assets approved"],
        3
    )
    
    plan = es_planner.add_step(
        plan,
        "Launch campaign on social media platforms",
        ["All channels activated", "Initial performance monitored", "Launch issues addressed"],
        2
    )
    
    plan = es_planner.add_step(
        plan,
        "Monitor and optimize campaign performance",
        ["Performance data analyzed", "Optimizations implemented", "Results documented"],
        2
    )
    
    # Step 3: Add dependencies between steps
    logger.info("Step 3: Add dependencies between steps")
    step_ids = [s["id"] for s in plan["steps"]]
    for i in range(1, len(step_ids)):
        plan = es_planner.add_dependency(plan, step_ids[i], step_ids[i-1])
    
    # Step 4: Assign roles to steps
    logger.info("Step 4: Assign roles to steps")
    plan = es_planner.assign_role(plan, step_ids[0], "MD")  # Objectives to MD
    plan = es_planner.assign_role(plan, step_ids[1], "MD")  # Strategy to MD
    plan = es_planner.assign_role(plan, step_ids[2], "MD")  # Assets to MD
    plan = es_planner.assign_role(plan, step_ids[3], "SMM")  # Launch to SMM
    plan = es_planner.assign_role(plan, step_ids[4], "SMM")  # Monitor to SMM
    
    # Store the plan directly using the adapter
    logger.info("Storing plan directly using the adapter")
    storage_adapter.store_plan(plan)
    
    # Step 5: Finalize the plan
    logger.info("Step 5: Finalize the plan")
    plan = es_planner.finalize_plan(plan)
    
    # Store the updated plan
    storage_adapter.store_plan(plan)
    
    # Step 6: Roles execute their assigned tasks
    logger.info("Step 6: Roles execute their assigned tasks")
    
    # Marketing Director executes their steps
    md_tasks = md_executor.get_assigned_tasks()
    logger.info(f"Marketing Director has {len(md_tasks.get(plan['id'], []))} tasks")
    
    for step in md_tasks.get(plan['id'], []):
        logger.info(f"Marketing Director executing step: {step['id']}")
        result = md_executor.execute_step(plan['id'], step['id'])
        logger.info(f"Execution result: {result['message']}")
        
        # Store the updated plan after each step
        updated_plan = storage_adapter.get_plan(plan['id'])
        if updated_plan:
            storage_adapter.store_plan(updated_plan)
    
    # Social Media Manager executes their steps
    smm_tasks = smm_executor.get_assigned_tasks()
    logger.info(f"Social Media Manager has {len(smm_tasks.get(plan['id'], []))} tasks")
    
    for step in smm_tasks.get(plan['id'], []):
        logger.info(f"Social Media Manager executing step: {step['id']}")
        result = smm_executor.execute_step(plan['id'], step['id'])
        logger.info(f"Execution result: {result['message']}")
        
        # Store the updated plan after each step
        updated_plan = storage_adapter.get_plan(plan['id'])
        if updated_plan:
            storage_adapter.store_plan(updated_plan)
    
    # Step 7: Executive Secretary reviews the completed plan
    logger.info("Step 7: Executive Secretary reviews the completed plan")
    final_plan = storage_adapter.get_plan(plan['id'])
    
    if not final_plan:
        logger.error(f"Could not retrieve final plan: {plan['id']}")
        return None
    
    # Print plan summary
    logger.info(f"Plan: {final_plan['description']}")
    logger.info(f"Status: {final_plan['status']}")
    logger.info(f"Steps: {len(final_plan['steps'])}")
    
    completed_steps = [s for s in final_plan['steps'] if s['status'] == 'completed']
    logger.info(f"Completed steps: {len(completed_steps)}/{len(final_plan['steps'])}")
    
    # Print artifacts
    logger.info("Artifacts produced:")
    for step in final_plan['steps']:
        if 'artifacts' in step:
            for artifact in step['artifacts']:
                logger.info(f"- {artifact.get('title', 'Unnamed artifact')} ({artifact.get('type', 'unknown')})")
    
    logger.info("Demonstration completed successfully")
    return final_plan

if __name__ == "__main__":
    run_demo() 