#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Trigger System

This module manages scheduled and event-based triggers for automated communications.
It handles the creation, execution, and management of triggers.
"""

import os
import json
import time
import logging
import datetime
import threading
import schedule
from typing import Dict, List, Optional, Any, Callable

logger = logging.getLogger(__name__)

class TriggerSystem:
    """
    Manages scheduled and event-based triggers for automated communications.
    """
    
    def __init__(self, message_router=None):
        """
        Initialize the trigger system.
        
        Args:
            message_router: The message router for sending messages
        """
        self.message_router = message_router
        
        # Define triggers directory
        self.triggers_dir = os.path.join(os.getcwd(), "triggers")
        
        # Create directory if it doesn't exist
        os.makedirs(self.triggers_dir, exist_ok=True)
        
        # Dictionary to store active triggers
        self.triggers = {}
        
        # Thread for running scheduled tasks
        self.scheduler_thread = None
        self.running = False
        
        # Load existing triggers
        self._load_triggers()
        
        logger.info("Trigger system initialized")
    
    def _load_triggers(self):
        """Load existing triggers from the triggers directory."""
        try:
            trigger_files = os.listdir(self.triggers_dir)
            
            for filename in trigger_files:
                if filename.endswith('.json'):
                    file_path = os.path.join(self.triggers_dir, filename)
                    
                    with open(file_path, 'r') as f:
                        trigger = json.load(f)
                    
                    # Add to active triggers
                    trigger_id = trigger.get('id')
                    if trigger_id and trigger.get('active', True):
                        self.triggers[trigger_id] = trigger
                        
                        # Schedule the trigger
                        self._schedule_trigger(trigger)
            
            logger.info(f"Loaded {len(self.triggers)} triggers")
        except Exception as e:
            logger.error(f"Error loading triggers: {e}")
    
    def _schedule_trigger(self, trigger):
        """
        Schedule a trigger based on its schedule type.
        
        Args:
            trigger: The trigger to schedule
        """
        trigger_id = trigger.get('id')
        schedule_type = trigger.get('schedule', {}).get('type')
        schedule_value = trigger.get('schedule', {}).get('value')
        
        if not schedule_type or not schedule_value:
            logger.warning(f"Invalid schedule for trigger {trigger_id}")
            return
        
        # Create a function to execute the trigger
        def execute_trigger():
            self._execute_trigger(trigger_id)
        
        # Schedule based on type
        if schedule_type == 'daily':
            # Schedule at specific time each day
            schedule.every().day.at(schedule_value).do(execute_trigger)
            logger.info(f"Scheduled trigger {trigger_id} to run daily at {schedule_value}")
        
        elif schedule_type == 'weekly':
            # Parse day and time
            try:
                day, time = schedule_value.split()
                day = day.lower()
                
                if day == 'monday':
                    schedule.every().monday.at(time).do(execute_trigger)
                elif day == 'tuesday':
                    schedule.every().tuesday.at(time).do(execute_trigger)
                elif day == 'wednesday':
                    schedule.every().wednesday.at(time).do(execute_trigger)
                elif day == 'thursday':
                    schedule.every().thursday.at(time).do(execute_trigger)
                elif day == 'friday':
                    schedule.every().friday.at(time).do(execute_trigger)
                elif day == 'saturday':
                    schedule.every().saturday.at(time).do(execute_trigger)
                elif day == 'sunday':
                    schedule.every().sunday.at(time).do(execute_trigger)
                else:
                    logger.warning(f"Invalid day for weekly trigger {trigger_id}: {day}")
                    return
                
                logger.info(f"Scheduled trigger {trigger_id} to run weekly on {day} at {time}")
            except ValueError:
                logger.warning(f"Invalid weekly schedule format for trigger {trigger_id}: {schedule_value}")
        
        elif schedule_type == 'monthly':
            # Parse day and time
            try:
                day, time = schedule_value.split()
                day = int(day)
                
                schedule.every().month.at(f"{day} {time}").do(execute_trigger)
                logger.info(f"Scheduled trigger {trigger_id} to run monthly on day {day} at {time}")
            except ValueError:
                logger.warning(f"Invalid monthly schedule format for trigger {trigger_id}: {schedule_value}")
        
        elif schedule_type == 'interval':
            # Schedule at regular intervals (in minutes)
            try:
                minutes = int(schedule_value)
                schedule.every(minutes).minutes.do(execute_trigger)
                logger.info(f"Scheduled trigger {trigger_id} to run every {minutes} minutes")
            except ValueError:
                logger.warning(f"Invalid interval for trigger {trigger_id}: {schedule_value}")
        
        else:
            logger.warning(f"Unknown schedule type for trigger {trigger_id}: {schedule_type}")
    
    def _execute_trigger(self, trigger_id):
        """
        Execute a trigger by sending a message.
        
        Args:
            trigger_id: The ID of the trigger to execute
            
        Returns:
            True if successful, False otherwise
        """
        if trigger_id not in self.triggers:
            logger.warning(f"Trigger not found: {trigger_id}")
            return False
        
        trigger = self.triggers[trigger_id]
        
        # Check if message router is available
        if not self.message_router:
            logger.warning(f"Cannot execute trigger {trigger_id}: no message router available")
            return False
        
        # Get trigger details
        source_role = trigger.get('source_role')
        target_role = trigger.get('target_role')
        message_template = trigger.get('message_template')
        
        if not source_role or not target_role or not message_template:
            logger.warning(f"Invalid trigger configuration for {trigger_id}")
            return False
        
        # Format the message
        formatted_message = f"[{source_role}]: @{target_role}: {message_template}"
        
        # Send the message
        result = self.message_router.route_message(formatted_message)
        
        # Update last executed timestamp
        trigger['last_executed'] = datetime.datetime.now().isoformat()
        self._save_trigger(trigger)
        
        if result.get('success'):
            logger.info(f"Executed trigger {trigger_id}")
            return True
        else:
            logger.error(f"Failed to execute trigger {trigger_id}: {result.get('error')}")
            return False
    
    def _save_trigger(self, trigger):
        """
        Save a trigger to file.
        
        Args:
            trigger: The trigger to save
            
        Returns:
            True if successful, False otherwise
        """
        try:
            trigger_id = trigger.get('id')
            if not trigger_id:
                logger.warning("Cannot save trigger without ID")
                return False
            
            file_path = os.path.join(self.triggers_dir, f"{trigger_id}.json")
            
            with open(file_path, 'w') as f:
                json.dump(trigger, f, indent=2)
            
            return True
        except Exception as e:
            logger.error(f"Error saving trigger: {e}")
            return False
    
    def add_scheduled_trigger(self, trigger_id, source_role, target_role, message_template, schedule_type, schedule_value):
        """
        Add a scheduled trigger.
        
        Args:
            trigger_id: Unique identifier for the trigger
            source_role: The role that will send the message
            target_role: The role that will receive the message
            message_template: The message template to use
            schedule_type: Type of schedule (daily, weekly, monthly, interval)
            schedule_value: Value for the schedule type
            
        Returns:
            True if successful, False otherwise
        """
        # Create trigger object
        trigger = {
            'id': trigger_id,
            'type': 'scheduled',
            'source_role': source_role,
            'target_role': target_role,
            'message_template': message_template,
            'schedule': {
                'type': schedule_type,
                'value': schedule_value
            },
            'active': True,
            'created_at': datetime.datetime.now().isoformat(),
            'last_executed': None
        }
        
        # Save trigger
        if not self._save_trigger(trigger):
            return False
        
        # Add to active triggers
        self.triggers[trigger_id] = trigger
        
        # Schedule the trigger
        self._schedule_trigger(trigger)
        
        logger.info(f"Added scheduled trigger: {trigger_id}")
        return True
    
    def remove_trigger(self, trigger_id):
        """
        Remove a trigger.
        
        Args:
            trigger_id: The ID of the trigger to remove
            
        Returns:
            True if successful, False otherwise
        """
        if trigger_id not in self.triggers:
            logger.warning(f"Trigger not found: {trigger_id}")
            return False
        
        # Remove from active triggers
        del self.triggers[trigger_id]
        
        # Remove from file system
        file_path = os.path.join(self.triggers_dir, f"{trigger_id}.json")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Removed trigger: {trigger_id}")
                return True
            except Exception as e:
                logger.error(f"Error removing trigger file: {e}")
                return False
        
        return True
    
    def get_trigger(self, trigger_id):
        """
        Get a trigger by ID.
        
        Args:
            trigger_id: The ID of the trigger to get
            
        Returns:
            The trigger object or None if not found
        """
        return self.triggers.get(trigger_id)
    
    def list_triggers(self):
        """
        List all triggers.
        
        Returns:
            List of trigger objects
        """
        return list(self.triggers.values())
    
    def start(self):
        """
        Start the trigger system.
        
        Returns:
            True if successful, False otherwise
        """
        if self.running:
            logger.warning("Trigger system is already running")
            return True
        
        # Start the scheduler thread
        def run_scheduler():
            logger.info("Scheduler thread started")
            while self.running:
                schedule.run_pending()
                time.sleep(1)
            logger.info("Scheduler thread stopped")
        
        self.running = True
        self.scheduler_thread = threading.Thread(target=run_scheduler)
        self.scheduler_thread.daemon = True
        self.scheduler_thread.start()
        
        logger.info("Trigger system started")
        return True
    
    def stop(self):
        """
        Stop the trigger system.
        
        Returns:
            True if successful, False otherwise
        """
        if not self.running:
            logger.warning("Trigger system is not running")
            return True
        
        # Stop the scheduler thread
        self.running = False
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=5)
            self.scheduler_thread = None
        
        logger.info("Trigger system stopped")
        return True 