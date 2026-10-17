# Archived Claude Role Management System

## Overview

This directory contains the archived files from our previous approach to implementing a role management system. These files represent an earlier version of the role management system with a different structure than our current implementation.

## Why This Was Archived

We initially used this structure for organizing role definitions, but later shifted to using Cursor's built-in rules system (`.cursor/rules`) for role management. The new approach provides better integration with Cursor and a more structured way to organize role knowledge.

The files in this archive represent our earlier work and are preserved for reference purposes.

## Contents

This archive includes:

1. **Role Definitions**:
   - Executive Secretary
   - Business Income Coach
   - Marketing Director
   - Social Media Manager
   - Copy Technical Writer
   - Utah Family Lawyer
   - Debt Consumer Law Coach
   - Software Engineering Scrum Master
   - Dating Relationship Coach

2. **Role Management System**:
   - Role activation mechanism
   - Role manager implementation

## Current Approach

Our current approach uses the `.cursor/rules` directory structure to implement role management directly within Cursor. This provides a more integrated and efficient solution that leverages Cursor's built-in capabilities.

For the current implementation, please refer to the `.cursor/rules` directory, which includes:

- Role definitions in `.cursor/rules/roles/`
- Role communication protocol in `.cursor/rules/system/role_communication_protocol.mdc`
- Knowledge management system in `.cursor/rules/roles/*/knowledge.mdc`

## Date Archived

March 8, 2025
