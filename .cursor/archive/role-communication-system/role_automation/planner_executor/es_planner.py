"""
Executive Secretary Planner Role

This module implements the Executive Secretary role as a planner in the
Planner-Executor architecture. The Executive Secretary is responsible for
creating plans, assigning tasks to specialized roles, and monitoring execution.
"""

import logging
from typing import Dict, List, Any, Optional, Tuple

from role_automation.planner_executor.planner_role import PlannerRole

logger = logging.getLogger(__name__)

class ExecutiveSecretaryPlanner(PlannerRole):
    """
    Executive Secretary implementation of the PlannerRole.
    
    The Executive Secretary is the primary planner in the system, responsible for:
    - Creating plans based on user requests
    - Assigning tasks to appropriate specialized roles
    - Monitoring execution progress
    - Coordinating between roles
    - Reporting status to the user
    """
    
    def __init__(self, storage_manager=None, message_router=None):
        """
        Initialize the Executive Secretary planner.
        
        Args:
            storage_manager: The storage manager for persisting plans
            message_router: The message router for communicating with other roles
        """
        super().__init__("ES", storage_manager, message_router)
        self.role_capabilities = self._load_role_capabilities()
        logger.info("Initialized Executive Secretary planner")
    
    def create_plan_from_request(self, request: str, available_roles: List[str]) -> Dict[str, Any]:
        """
        Create a plan from a user request.
        
        Args:
            request (str): The user's request
            available_roles (List[str]): List of available role IDs
            
        Returns:
            Dict[str, Any]: The created plan
        """
        # Create a basic plan
        plan = self.create_plan(request, available_roles)
        
        # Add metadata
        plan["metadata"]["source"] = "user_request"
        plan["metadata"]["original_request"] = request
        
        logger.info(f"Created plan from user request: {plan['id']}")
        return plan
    
    def analyze_request(self, request: str) -> Dict[str, Any]:
        """
        Analyze a user request to determine required steps and roles.
        
        Args:
            request (str): The user's request
            
        Returns:
            Dict[str, Any]: Analysis results
        """
        # This is a placeholder for more sophisticated analysis
        # In a real implementation, this would use NLP to parse the request
        # and determine the required steps and roles
        
        analysis = {
            "request": request,
            "identified_tasks": [],
            "suggested_roles": [],
            "complexity": "medium",
            "estimated_steps": 3
        }
        
        # Simple keyword matching for roles
        role_keywords = {
            "BIC": ["business", "income", "revenue", "profit", "strategy"],
            "MD": ["marketing", "promotion", "campaign", "audience"],
            "SMM": ["social media", "facebook", "twitter", "instagram", "post"],
            "CTW": ["content", "writing", "document", "article", "blog"],
            "SET": ["code", "programming", "software", "development", "technical"]
        }
        
        for role, keywords in role_keywords.items():
            for keyword in keywords:
                if keyword.lower() in request.lower():
                    if role not in analysis["suggested_roles"]:
                        analysis["suggested_roles"].append(role)
        
        return analysis
    
    def assign_roles_automatically(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Automatically assign roles to steps based on role capabilities.
        
        Args:
            plan (Dict[str, Any]): The plan to update
            
        Returns:
            Dict[str, Any]: The updated plan
        """
        for step in plan["steps"]:
            if step.get("assigned_role") is not None:
                continue  # Skip already assigned steps
            
            best_role = self._find_best_role_for_step(step, plan["available_roles"])
            if best_role:
                plan = self.assign_role(plan, step["id"], best_role)
        
        return plan
    
    def create_standard_plan(self, task_type: str, task_description: str, 
                             available_roles: List[str]) -> Dict[str, Any]:
        """
        Create a standard plan for a common task type.
        
        Args:
            task_type (str): The type of task (e.g., 'content_creation', 'marketing_campaign')
            task_description (str): Description of the task
            available_roles (List[str]): List of available role IDs
            
        Returns:
            Dict[str, Any]: The created plan
        """
        plan = self.create_plan(task_description, available_roles)
        
        # Add standard steps based on task type
        if task_type == "content_creation":
            self._add_content_creation_steps(plan)
        elif task_type == "marketing_campaign":
            self._add_marketing_campaign_steps(plan)
        elif task_type == "software_development":
            self._add_software_development_steps(plan)
        else:
            logger.warning(f"Unknown task type: {task_type}")
        
        # Automatically assign roles
        plan = self.assign_roles_automatically(plan)
        
        return plan
    
    def handle_clarification_request(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle a clarification request from an executor.
        
        Args:
            message (Dict[str, Any]): The clarification request message
            
        Returns:
            Dict[str, Any]: The response message
        """
        metadata = message.get("metadata", {})
        plan_id = metadata.get("plan_id")
        step_id = metadata.get("step_id")
        question = metadata.get("question")
        
        if not all([plan_id, step_id, question]):
            logger.warning("Invalid clarification request")
            return {
                "source_role": self.role_id,
                "target_role": message.get("source_role"),
                "content": "Invalid clarification request. Please provide plan_id, step_id, and question.",
                "metadata": {
                    "type": "clarification_response",
                    "status": "error"
                }
            }
        
        # Get the plan
        plan = self.get_plan(plan_id)
        if not plan:
            logger.warning(f"Plan not found: {plan_id}")
            return {
                "source_role": self.role_id,
                "target_role": message.get("source_role"),
                "content": f"Plan {plan_id} not found.",
                "metadata": {
                    "type": "clarification_response",
                    "status": "error",
                    "plan_id": plan_id,
                    "step_id": step_id
                }
            }
        
        # Find the step
        step = next((s for s in plan["steps"] if s["id"] == step_id), None)
        if not step:
            logger.warning(f"Step {step_id} not found in plan {plan_id}")
            return {
                "source_role": self.role_id,
                "target_role": message.get("source_role"),
                "content": f"Step {step_id} not found in plan {plan_id}.",
                "metadata": {
                    "type": "clarification_response",
                    "status": "error",
                    "plan_id": plan_id,
                    "step_id": step_id
                }
            }
        
        # Generate a response (placeholder for more sophisticated logic)
        response = {
            "source_role": self.role_id,
            "target_role": message.get("source_role"),
            "content": f"Regarding your question about step '{step['description']}': {self._generate_clarification(question, step)}",
            "metadata": {
                "type": "clarification_response",
                "status": "success",
                "plan_id": plan_id,
                "step_id": step_id,
                "question": question
            }
        }
        
        return response
    
    def _load_role_capabilities(self) -> Dict[str, Dict[str, Any]]:
        """
        Load role capabilities for task assignment.
        
        Returns:
            Dict[str, Dict[str, Any]]: Role capabilities
        """
        # This is a placeholder for loading from a configuration file
        return {
            "ES": {
                "coordination": 5,
                "planning": 5,
                "documentation": 4,
                "communication": 5
            },
            "BIC": {
                "business_strategy": 5,
                "financial_analysis": 5,
                "market_research": 4,
                "revenue_optimization": 5
            },
            "MD": {
                "marketing_strategy": 5,
                "campaign_planning": 5,
                "audience_analysis": 4,
                "brand_development": 5
            },
            "SMM": {
                "social_media_strategy": 5,
                "content_creation": 4,
                "community_management": 5,
                "analytics": 4
            },
            "CTW": {
                "content_creation": 5,
                "editing": 5,
                "research": 4,
                "technical_writing": 5
            },
            "SET": {
                "software_development": 5,
                "system_architecture": 5,
                "testing": 4,
                "technical_documentation": 4
            }
        }
    
    def _find_best_role_for_step(self, step: Dict[str, Any], available_roles: List[str]) -> Optional[str]:
        """
        Find the best role for a step based on capabilities.
        
        Args:
            step (Dict[str, Any]): The step to assign
            available_roles (List[str]): List of available role IDs
            
        Returns:
            Optional[str]: The best role ID or None if no suitable role found
        """
        # Extract keywords from step description
        description = step.get("description", "").lower()
        
        # Simple keyword matching for capabilities
        capability_keywords = {
            "business_strategy": ["business", "strategy", "plan", "growth"],
            "financial_analysis": ["financial", "analysis", "revenue", "profit"],
            "marketing_strategy": ["marketing", "strategy", "campaign"],
            "social_media_strategy": ["social media", "facebook", "twitter"],
            "content_creation": ["content", "create", "write", "article"],
            "software_development": ["code", "develop", "program", "software"],
            "coordination": ["coordinate", "organize", "manage"],
            "planning": ["plan", "schedule", "timeline"],
            "documentation": ["document", "record", "write up"],
            "communication": ["communicate", "message", "inform"]
        }
        
        # Score each role based on step description
        role_scores = {role: 0 for role in available_roles}
        
        for capability, keywords in capability_keywords.items():
            for keyword in keywords:
                if keyword in description:
                    for role in available_roles:
                        if role in self.role_capabilities and capability in self.role_capabilities[role]:
                            role_scores[role] += self.role_capabilities[role][capability]
        
        # Find the role with the highest score
        best_role = None
        best_score = 0
        
        for role, score in role_scores.items():
            if score > best_score:
                best_role = role
                best_score = score
        
        return best_role
    
    def _add_content_creation_steps(self, plan: Dict[str, Any]) -> None:
        """
        Add standard steps for content creation.
        
        Args:
            plan (Dict[str, Any]): The plan to update
        """
        self.add_step(
            plan,
            "Research the topic and gather information",
            ["Research completed", "Key information identified", "Sources documented"],
            2
        )
        
        self.add_step(
            plan,
            "Create content outline",
            ["Outline includes main sections", "Key points identified", "Flow is logical"],
            1
        )
        
        self.add_step(
            plan,
            "Write first draft",
            ["Draft covers all points in outline", "Content is accurate", "Draft is complete"],
            3
        )
        
        self.add_step(
            plan,
            "Review and edit content",
            ["Grammar and spelling checked", "Content is clear and concise", "Formatting is consistent"],
            2
        )
        
        self.add_step(
            plan,
            "Finalize and deliver content",
            ["Final version approved", "Delivered in required format", "All feedback addressed"],
            1
        )
        
        # Add dependencies
        step_ids = [s["id"] for s in plan["steps"]]
        for i in range(1, len(step_ids)):
            self.add_dependency(plan, step_ids[i], step_ids[i-1])
    
    def _add_marketing_campaign_steps(self, plan: Dict[str, Any]) -> None:
        """
        Add standard steps for marketing campaign.
        
        Args:
            plan (Dict[str, Any]): The plan to update
        """
        self.add_step(
            plan,
            "Define campaign objectives and target audience",
            ["Objectives are SMART", "Target audience is clearly defined", "Success metrics established"],
            2
        )
        
        self.add_step(
            plan,
            "Develop campaign strategy and messaging",
            ["Strategy aligns with objectives", "Messaging is compelling", "Brand guidelines followed"],
            3
        )
        
        self.add_step(
            plan,
            "Create campaign assets",
            ["All required assets created", "Assets follow brand guidelines", "Assets approved"],
            3
        )
        
        self.add_step(
            plan,
            "Set up campaign tracking and analytics",
            ["Tracking implemented correctly", "Analytics dashboard created", "Baseline metrics recorded"],
            2
        )
        
        self.add_step(
            plan,
            "Launch campaign",
            ["All channels activated", "Initial performance monitored", "Launch issues addressed"],
            1
        )
        
        self.add_step(
            plan,
            "Monitor and optimize campaign",
            ["Performance data analyzed", "Optimizations implemented", "Results documented"],
            2
        )
        
        # Add dependencies
        step_ids = [s["id"] for s in plan["steps"]]
        for i in range(1, len(step_ids)):
            self.add_dependency(plan, step_ids[i], step_ids[i-1])
    
    def _add_software_development_steps(self, plan: Dict[str, Any]) -> None:
        """
        Add standard steps for software development.
        
        Args:
            plan (Dict[str, Any]): The plan to update
        """
        self.add_step(
            plan,
            "Gather requirements and create specifications",
            ["Requirements documented", "Specifications approved", "Edge cases identified"],
            2
        )
        
        self.add_step(
            plan,
            "Design system architecture",
            ["Architecture diagram created", "Components identified", "Interfaces defined"],
            3
        )
        
        self.add_step(
            plan,
            "Implement core functionality",
            ["Code follows standards", "Core features implemented", "Basic error handling in place"],
            4
        )
        
        self.add_step(
            plan,
            "Write tests",
            ["Unit tests created", "Integration tests created", "Edge cases covered"],
            3
        )
        
        self.add_step(
            plan,
            "Perform code review and refactoring",
            ["Code review completed", "Issues addressed", "Code refactored for clarity"],
            2
        )
        
        self.add_step(
            plan,
            "Deploy and document",
            ["Deployment successful", "Documentation complete", "Usage examples provided"],
            2
        )
        
        # Add dependencies
        step_ids = [s["id"] for s in plan["steps"]]
        for i in range(1, len(step_ids)):
            self.add_dependency(plan, step_ids[i], step_ids[i-1])
    
    def _generate_clarification(self, question: str, step: Dict[str, Any]) -> str:
        """
        Generate a clarification response for a question about a step.
        
        Args:
            question (str): The question asked
            step (Dict[str, Any]): The step the question is about
            
        Returns:
            str: The clarification response
        """
        # This is a placeholder for more sophisticated response generation
        if "what" in question.lower() and "do" in question.lower():
            return f"For this step, you should focus on {step['description']}. The acceptance criteria are: {', '.join(step['acceptance_criteria'])}."
        
        if "how" in question.lower():
            return f"To complete this step, you should use your expertise in {step['assigned_role']} to {step['description'].lower()}. Make sure to meet all acceptance criteria."
        
        if "why" in question.lower():
            return f"This step is necessary because it contributes to the overall plan of '{step.get('plan_description', 'the task')}'. It's important to complete it properly to ensure the success of the plan."
        
        # Default response
        return f"Please proceed with the step as described. If you have specific concerns, please provide more details so I can assist you better." 