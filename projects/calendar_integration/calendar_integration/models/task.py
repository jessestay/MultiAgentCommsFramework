"""
Task model module.

This module provides a data model for tasks.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import json


class Task:
    """
    Data model for a task.
    """

    def __init__(self, task_data: Optional[Dict[str, Any]] = None):
        """
        Initialize a Task instance.
        
        Args:
            task_data: Optional dictionary containing task data.
        """
        self.id = None
        self.title = None
        self.notes = None
        self.due = None
        self.status = "needsAction"
        self.completed = None
        self.parent = None
        self.position = None
        
        if task_data:
            self.from_dict(task_data)

    def from_dict(self, task_data: Dict[str, Any]) -> 'Task':
        """
        Update the task from a dictionary.
        
        Args:
            task_data: Dictionary containing task data.
            
        Returns:
            The updated Task instance.
        """
        self.id = task_data.get('id')
        self.title = task_data.get('title')
        self.notes = task_data.get('notes')
        self.due = task_data.get('due')
        self.status = task_data.get('status', 'needsAction')
        self.completed = task_data.get('completed')
        self.parent = task_data.get('parent')
        self.position = task_data.get('position')
        
        return self

    def to_dict(self) -> Dict[str, Any]:
        """
        Convert the task to a dictionary.
        
        Returns:
            Dictionary representation of the task.
        """
        task_dict = {
            'title': self.title,
            'status': self.status
        }
        
        # Add optional fields if they exist
        if self.id:
            task_dict['id'] = self.id
        if self.notes:
            task_dict['notes'] = self.notes
        if self.due:
            task_dict['due'] = self.due
        if self.completed:
            task_dict['completed'] = self.completed
        if self.parent:
            task_dict['parent'] = self.parent
        if self.position:
            task_dict['position'] = self.position
            
        # Remove None values
        return {k: v for k, v in task_dict.items() if v is not None}

    def to_json(self) -> str:
        """
        Convert the task to a JSON string.
        
        Returns:
            JSON string representation of the task.
        """
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, json_str: str) -> 'Task':
        """
        Create a Task instance from a JSON string.
        
        Args:
            json_str: JSON string containing task data.
            
        Returns:
            A new Task instance.
        """
        task_data = json.loads(json_str)
        return cls(task_data)

    def set_due_date(self, due_date: datetime) -> 'Task':
        """
        Set the due date of the task.
        
        Args:
            due_date: The due date of the task.
            
        Returns:
            The updated Task instance.
        """
        self.due = due_date.isoformat() + 'Z'
        return self

    def mark_completed(self) -> 'Task':
        """
        Mark the task as completed.
        
        Returns:
            The updated Task instance.
        """
        self.status = 'completed'
        self.completed = datetime.utcnow().isoformat() + 'Z'
        return self

    def mark_needs_action(self) -> 'Task':
        """
        Mark the task as needing action.
        
        Returns:
            The updated Task instance.
        """
        self.status = 'needsAction'
        self.completed = None
        return self

    def set_parent(self, parent_id: str) -> 'Task':
        """
        Set the parent task of this task.
        
        Args:
            parent_id: The ID of the parent task.
            
        Returns:
            The updated Task instance.
        """
        self.parent = parent_id
        return self

    def set_position(self, position: str) -> 'Task':
        """
        Set the position of the task in the task list.
        
        Args:
            position: The position string.
            
        Returns:
            The updated Task instance.
        """
        self.position = position
        return self 