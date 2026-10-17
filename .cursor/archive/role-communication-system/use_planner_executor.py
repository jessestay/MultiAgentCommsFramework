#!/usr/bin/env python
"""
Using the Planner-Executor Architecture for a Content Marketing Campaign

This script demonstrates how to use the Planner-Executor Architecture to plan and execute
a content marketing campaign involving multiple specialized roles.
"""

import os
import sys
import logging
from typing import Dict, List, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('content_campaign.log')
    ]
)

logger = logging.getLogger(__name__)

# Import system components
from role_automation.security_manager import SecurityManager
from role_automation.storage_manager import StorageManager
from role_automation.message_router import MessageRouter
from role_automation.planner_executor.storage_adapter import StorageAdapter
from role_automation.planner_executor.message_adapter import MessageAdapter
from role_automation.planner_executor.es_planner import ExecutiveSecretaryPlanner
from role_automation.planner_executor.executor_role import ExecutorRole

# Define specialized role executors
class ContentTechnicalWriterExecutor(ExecutorRole):
    """Content/Technical Writer implementation of the ExecutorRole."""
    
    def execute_step(self, plan_id: str, step_id: str, context=None):
        """Execute a specific step assigned to the Content/Technical Writer."""
        # Call the base implementation to handle common logic
        result = super().execute_step(plan_id, step_id, context)
        
        if not result["success"]:
            return result
        
        # Get the plan and step
        plan = self._retrieve_plan(plan_id)
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        
        logger.info(f"Content/Technical Writer executing: {step['description']}")
        
        # Create artifacts based on the step
        artifacts = []
        
        if "research" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Content Research Document",
                "content": "Comprehensive research on the topic including key statistics and expert quotes.",
                "url": "https://example.com/content/research"
            })
        elif "outline" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Content Outline",
                "content": "Detailed outline of the content piece with section headers and key points.",
                "url": "https://example.com/content/outline"
            })
        elif "draft" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Content First Draft",
                "content": "Complete first draft of the content piece ready for review.",
                "url": "https://example.com/content/draft"
            })
        elif "final" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Final Content",
                "content": "Polished final version of the content incorporating all feedback.",
                "url": "https://example.com/content/final"
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

class MarketingDirectorExecutor(ExecutorRole):
    """Marketing Director implementation of the ExecutorRole."""
    
    def execute_step(self, plan_id: str, step_id: str, context=None):
        """Execute a specific step assigned to the Marketing Director."""
        # Call the base implementation to handle common logic
        result = super().execute_step(plan_id, step_id, context)
        
        if not result["success"]:
            return result
        
        # Get the plan and step
        plan = self._retrieve_plan(plan_id)
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        
        logger.info(f"Marketing Director executing: {step['description']}")
        
        # Create artifacts based on the step
        artifacts = []
        
        if "strategy" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Content Strategy Document",
                "content": "Comprehensive content strategy including goals, target audience, and KPIs.",
                "url": "https://example.com/marketing/strategy"
            })
        elif "review" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Content Review Feedback",
                "content": "Detailed feedback on the content draft with suggestions for improvement.",
                "url": "https://example.com/marketing/review"
            })
        elif "approval" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Content Approval",
                "content": "Official approval of the final content with sign-off for publication.",
                "url": "https://example.com/marketing/approval"
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
    
    def execute_step(self, plan_id: str, step_id: str, context=None):
        """Execute a specific step assigned to the Social Media Manager."""
        # Call the base implementation to handle common logic
        result = super().execute_step(plan_id, step_id, context)
        
        if not result["success"]:
            return result
        
        # Get the plan and step
        plan = self._retrieve_plan(plan_id)
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        
        logger.info(f"Social Media Manager executing: {step['description']}")
        
        # Create artifacts based on the step
        artifacts = []
        
        if "promotion plan" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Social Media Promotion Plan",
                "content": "Detailed plan for promoting the content across social media channels.",
                "url": "https://example.com/social/plan"
            })
        elif "assets" in step["description"].lower():
            artifacts.append({
                "type": "image",
                "title": "Social Media Graphics",
                "content": "Set of graphics optimized for different social media platforms.",
                "url": "https://example.com/social/graphics"
            })
            artifacts.append({
                "type": "document",
                "title": "Social Media Copy",
                "content": "Platform-specific copy for social media posts.",
                "url": "https://example.com/social/copy"
            })
        elif "schedule" in step["description"].lower():
            artifacts.append({
                "type": "document",
                "title": "Content Publication Schedule",
                "content": "Detailed schedule for publishing content across channels.",
                "url": "https://example.com/social/schedule"
            })
        elif "publish" in step["description"].lower():
            artifacts.append({
                "type": "link",
                "title": "Published Content",
                "content": "Links to the published content across all platforms.",
                "url": "https://example.com/social/published"
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

def create_content_campaign_plan():
    """Create a plan for a content marketing campaign."""
    # Initialize system components
    security_manager = SecurityManager()
    storage_manager = StorageManager(security_manager)
    message_router = MessageRouter(security_manager, storage_manager)
    
    # Initialize adapters
    storage_adapter = StorageAdapter(storage_manager, message_router)
    message_adapter = MessageAdapter(message_router, storage_adapter)
    
    # Initialize Executive Secretary planner
    es_planner = ExecutiveSecretaryPlanner(storage_adapter, message_adapter)
    
    # Create a plan for a content marketing campaign
    logger.info("Creating content marketing campaign plan")
    plan = es_planner.create_plan(
        "Expert Guide to AI Implementation in Business",
        ["ES", "CTW", "MD", "SMM"]
    )
    
    # Add steps to the plan
    logger.info("Adding steps to the plan")
    
    # Strategy phase
    plan = es_planner.add_step(
        plan,
        "Develop content strategy and goals",
        ["Target audience defined", "Content goals established", "KPIs identified"],
        2
    )
    
    # Content creation phase
    plan = es_planner.add_step(
        plan,
        "Research AI implementation case studies and statistics",
        ["Key statistics identified", "Case studies selected", "Expert sources identified"],
        3
    )
    
    plan = es_planner.add_step(
        plan,
        "Create detailed content outline",
        ["Structure defined", "Key points identified", "Sources allocated"],
        2
    )
    
    plan = es_planner.add_step(
        plan,
        "Write first draft of the guide",
        ["All sections completed", "Case studies incorporated", "Statistics included"],
        4
    )
    
    plan = es_planner.add_step(
        plan,
        "Review and provide feedback on draft",
        ["Accuracy verified", "Messaging alignment checked", "Improvement suggestions provided"],
        2
    )
    
    plan = es_planner.add_step(
        plan,
        "Revise and finalize content",
        ["Feedback incorporated", "Final edits completed", "Content polished"],
        3
    )
    
    plan = es_planner.add_step(
        plan,
        "Final approval of content",
        ["Content approved", "Legal compliance verified", "Brand guidelines followed"],
        1
    )
    
    # Promotion phase
    plan = es_planner.add_step(
        plan,
        "Create social media promotion plan",
        ["Channels identified", "Posting frequency determined", "Audience targeting defined"],
        2
    )
    
    plan = es_planner.add_step(
        plan,
        "Develop social media assets",
        ["Graphics created", "Copy written", "CTAs defined"],
        3
    )
    
    plan = es_planner.add_step(
        plan,
        "Schedule content publication and promotion",
        ["Publication date set", "Promotion schedule created", "Team members notified"],
        1
    )
    
    plan = es_planner.add_step(
        plan,
        "Publish and promote content",
        ["Content published", "Social promotion started", "Email campaign sent"],
        2
    )
    
    # Add dependencies between steps
    logger.info("Adding dependencies between steps")
    for i in range(2, 12):
        plan = es_planner.add_dependency(plan, f"step_{i}", f"step_{i-1}")
    
    # Assign roles to steps
    logger.info("Assigning roles to steps")
    plan = es_planner.assign_role(plan, "step_1", "MD")  # Strategy to MD
    plan = es_planner.assign_role(plan, "step_2", "CTW")  # Research to CTW
    plan = es_planner.assign_role(plan, "step_3", "CTW")  # Outline to CTW
    plan = es_planner.assign_role(plan, "step_4", "CTW")  # Draft to CTW
    plan = es_planner.assign_role(plan, "step_5", "MD")   # Review to MD
    plan = es_planner.assign_role(plan, "step_6", "CTW")  # Revise to CTW
    plan = es_planner.assign_role(plan, "step_7", "MD")   # Approval to MD
    plan = es_planner.assign_role(plan, "step_8", "SMM")  # Promotion plan to SMM
    plan = es_planner.assign_role(plan, "step_9", "SMM")  # Social assets to SMM
    plan = es_planner.assign_role(plan, "step_10", "SMM") # Schedule to SMM
    plan = es_planner.assign_role(plan, "step_11", "SMM") # Publish to SMM
    
    # Finalize the plan
    logger.info("Finalizing the plan")
    plan = es_planner.finalize_plan(plan)
    
    logger.info(f"Content marketing campaign plan created with ID: {plan['id']}")
    return plan, es_planner, storage_adapter, message_adapter

def execute_content_campaign(plan, es_planner, storage_adapter, message_adapter):
    """Execute the content marketing campaign plan."""
    # Initialize role executors
    ctw_executor = ContentTechnicalWriterExecutor("CTW", storage_adapter, message_adapter)
    md_executor = MarketingDirectorExecutor("MD", storage_adapter, message_adapter)
    smm_executor = SocialMediaManagerExecutor("SMM", storage_adapter, message_adapter)
    
    # Execute steps in order
    logger.info("Starting plan execution")
    
    # Get tasks for each role
    ctw_tasks = ctw_executor.get_assigned_tasks()
    md_tasks = md_executor.get_assigned_tasks()
    smm_tasks = smm_executor.get_assigned_tasks()
    
    logger.info(f"CTW has {len(ctw_tasks.get(plan['id'], []))} tasks")
    logger.info(f"MD has {len(md_tasks.get(plan['id'], []))} tasks")
    logger.info(f"SMM has {len(smm_tasks.get(plan['id'], []))} tasks")
    
    # Execute steps in dependency order
    for step_num in range(1, 12):
        step_id = f"step_{step_num}"
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        
        if not step:
            logger.warning(f"Step {step_id} not found in plan")
            continue
        
        role = step["assigned_role"]
        logger.info(f"Executing step {step_id}: {step['description']} (Assigned to: {role})")
        
        if role == "CTW":
            result = ctw_executor.execute_step(plan["id"], step_id)
        elif role == "MD":
            result = md_executor.execute_step(plan["id"], step_id)
        elif role == "SMM":
            result = smm_executor.execute_step(plan["id"], step_id)
        else:
            logger.warning(f"Unknown role: {role}")
            continue
        
        logger.info(f"Step {step_id} execution result: {result['message']}")
        
        # Get updated plan
        plan = es_planner.get_plan(plan["id"])
    
    # Get final plan status
    final_plan = es_planner.get_plan(plan["id"])
    
    logger.info("Plan execution completed")
    logger.info(f"Plan status: {final_plan['status']}")
    
    completed_steps = [s for s in final_plan["steps"] if s["status"] == "completed"]
    logger.info(f"Completed steps: {len(completed_steps)}/{len(final_plan['steps'])}")
    
    # Print artifacts produced
    logger.info("Artifacts produced:")
    for step in final_plan["steps"]:
        if "artifacts" in step:
            for artifact in step["artifacts"]:
                logger.info(f"- {artifact.get('title', 'Unnamed artifact')} ({artifact.get('type', 'unknown')})")
    
    return final_plan

def main():
    """Main function to run the content marketing campaign."""
    # Create the plan
    plan, es_planner, storage_adapter, message_adapter = create_content_campaign_plan()
    
    # Execute the plan
    final_plan = execute_content_campaign(plan, es_planner, storage_adapter, message_adapter)
    
    # Print summary
    print("\n" + "="*50)
    print("CONTENT MARKETING CAMPAIGN SUMMARY")
    print("="*50)
    print(f"Campaign: {final_plan['description']}")
    print(f"Status: {final_plan['status']}")
    print(f"Steps completed: {sum(1 for s in final_plan['steps'] if s['status'] == 'completed')}/{len(final_plan['steps'])}")
    print("\nArtifacts produced:")
    for step in final_plan['steps']:
        if 'artifacts' in step:
            for artifact in step['artifacts']:
                print(f"- {artifact.get('title', 'Unnamed artifact')} ({artifact.get('type', 'unknown')})")
    print("="*50)
    
    return final_plan

if __name__ == "__main__":
    main() 