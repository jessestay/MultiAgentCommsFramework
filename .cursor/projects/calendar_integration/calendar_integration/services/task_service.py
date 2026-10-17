"""
Task service module for interacting with Google Tasks API.

This module provides a service for interacting with the Google Tasks API,
including retrieving, creating, updating, and deleting tasks and task lists.
"""

import os
from typing import Dict, List, Any, Optional
from datetime import datetime

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from calendar_integration.auth.oauth import GoogleOAuth
from calendar_integration.privacy.filters import PrivacyFilter


class TaskService:
    """
    Service for interacting with the Google Tasks API.
    """

    def __init__(self, credentials: Optional[Credentials] = None):
        """
        Initialize the TaskService instance.

        Args:
            credentials: Optional Google OAuth credentials. If not provided,
                         the instance will be initialized without credentials.
        """
        self._credentials = credentials
        self._service = None
        self._privacy_filter = PrivacyFilter()
        
        if credentials:
            self._service = build('tasks', 'v1', credentials=credentials)

    def set_credentials(self, credentials: Credentials) -> None:
        """
        Set the credentials for the service.

        Args:
            credentials: Google OAuth credentials.
        """
        self._credentials = credentials
        self._service = build('tasks', 'v1', credentials=credentials)

    def _ensure_service(self) -> None:
        """
        Ensure that the service is initialized.

        Raises:
            ValueError: If no credentials are available.
        """
        if not self._service:
            if not self._credentials:
                raise ValueError("No credentials available. Authenticate first.")
            self._service = build('tasks', 'v1', credentials=self._credentials)

    def get_task_lists(self) -> List[Dict[str, Any]]:
        """
        Get a list of task lists for the authenticated user.

        Returns:
            A list of task list objects.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            task_lists = []
            page_token = None
            
            while True:
                tasklists_result = self._service.tasklists().list(pageToken=page_token).execute()
                task_lists.extend(tasklists_result.get('items', []))
                
                page_token = tasklists_result.get('nextPageToken')
                if not page_token:
                    break
                    
            return task_lists
        except HttpError as error:
            print(f"Error retrieving task lists: {error}")
            raise

    def create_task_list(self, title: str) -> Dict[str, Any]:
        """
        Create a new task list.

        Args:
            title: The title of the task list.

        Returns:
            The created task list object.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            task_list = self._service.tasklists().insert(
                body={'title': title}
            ).execute()
            
            return task_list
        except HttpError as error:
            print(f"Error creating task list: {error}")
            raise

    def delete_task_list(self, task_list_id: str) -> bool:
        """
        Delete a task list.

        Args:
            task_list_id: The ID of the task list to delete.

        Returns:
            True if the task list was deleted successfully, False otherwise.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            self._service.tasklists().delete(tasklist=task_list_id).execute()
            return True
        except HttpError as error:
            print(f"Error deleting task list: {error}")
            raise

    def get_tasks(self, task_list_id: str, show_completed: bool = True, 
                 show_hidden: bool = False) -> List[Dict[str, Any]]:
        """
        Get tasks from a task list.

        Args:
            task_list_id: The ID of the task list to retrieve tasks from.
            show_completed: Whether to include completed tasks. Default is True.
            show_hidden: Whether to include hidden tasks. Default is False.

        Returns:
            A list of task objects.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            tasks = []
            page_token = None
            
            while True:
                tasks_result = self._service.tasks().list(
                    tasklist=task_list_id,
                    showCompleted=show_completed,
                    showHidden=show_hidden,
                    pageToken=page_token
                ).execute()
                
                # Apply privacy filter to each task
                filtered_tasks = [self._privacy_filter.filter_task(task) 
                                 for task in tasks_result.get('items', [])]
                tasks.extend(filtered_tasks)
                
                page_token = tasks_result.get('nextPageToken')
                if not page_token:
                    break
                    
            return tasks
        except HttpError as error:
            print(f"Error retrieving tasks: {error}")
            raise

    def create_task(self, task_list_id: str, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new task in a task list.

        Args:
            task_list_id: The ID of the task list to create the task in.
            task_data: The task data to create.

        Returns:
            The created task object.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            task = self._service.tasks().insert(
                tasklist=task_list_id,
                body=task_data
            ).execute()
            
            return task
        except HttpError as error:
            print(f"Error creating task: {error}")
            raise

    def update_task(self, task_list_id: str, task_id: str, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update an existing task in a task list.

        Args:
            task_list_id: The ID of the task list containing the task.
            task_id: The ID of the task to update.
            task_data: The updated task data.

        Returns:
            The updated task object.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            task = self._service.tasks().update(
                tasklist=task_list_id,
                task=task_id,
                body=task_data
            ).execute()
            
            return task
        except HttpError as error:
            print(f"Error updating task: {error}")
            raise

    def delete_task(self, task_list_id: str, task_id: str) -> bool:
        """
        Delete a task from a task list.

        Args:
            task_list_id: The ID of the task list containing the task.
            task_id: The ID of the task to delete.

        Returns:
            True if the task was deleted successfully, False otherwise.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            self._service.tasks().delete(
                tasklist=task_list_id,
                task=task_id
            ).execute()
            
            return True
        except HttpError as error:
            print(f"Error deleting task: {error}")
            raise

    def complete_task(self, task_list_id: str, task_id: str) -> Dict[str, Any]:
        """
        Mark a task as completed.

        Args:
            task_list_id: The ID of the task list containing the task.
            task_id: The ID of the task to mark as completed.

        Returns:
            The updated task object.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            # First, get the current task data
            task = self._service.tasks().get(
                tasklist=task_list_id,
                task=task_id
            ).execute()
            
            # Update the status to 'completed' and set the completion date
            task['status'] = 'completed'
            task['completed'] = datetime.utcnow().isoformat() + 'Z'
            
            # Update the task
            updated_task = self._service.tasks().update(
                tasklist=task_list_id,
                task=task_id,
                body=task
            ).execute()
            
            return updated_task
        except HttpError as error:
            print(f"Error completing task: {error}")
            raise

    def clear_completed_tasks(self, task_list_id: str) -> bool:
        """
        Clear all completed tasks from a task list.

        Args:
            task_list_id: The ID of the task list to clear completed tasks from.

        Returns:
            True if the completed tasks were cleared successfully, False otherwise.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            self._service.tasks().clear(tasklist=task_list_id).execute()
            return True
        except HttpError as error:
            print(f"Error clearing completed tasks: {error}")
            raise

    def move_task(self, task_list_id: str, task_id: str, parent: Optional[str] = None, 
                 previous: Optional[str] = None) -> Dict[str, Any]:
        """
        Move a task to a different position in a task list.

        Args:
            task_list_id: The ID of the task list containing the task.
            task_id: The ID of the task to move.
            parent: The ID of the parent task. If provided, the task will be moved to be a child of this task.
            previous: The ID of the previous task. If provided, the task will be moved to be after this task.

        Returns:
            The moved task object.

        Raises:
            ValueError: If no credentials are available.
            HttpError: If the API request fails.
        """
        self._ensure_service()
        
        try:
            task = self._service.tasks().move(
                tasklist=task_list_id,
                task=task_id,
                parent=parent,
                previous=previous
            ).execute()
            
            return task
        except HttpError as error:
            print(f"Error moving task: {error}")
            raise 