#!/usr/bin/env python3
"""Import Google Sheets MCP workflows into n8n"""
import requests
import json
import os
import sys

BASE_URL = "http://localhost:5678"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJiMDFkMmI5ZS1mOTdkLTQ5YWYtYjE4MC1lODViMjQ3MDVjZGYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzYwNTk0OTYyfQ.nN128ZrRjHEyXH00qPzkt2jxqucZV4SCDBVeOZMS4RI"

headers = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}

def import_workflow(filepath):
    """Import a workflow JSON file into n8n"""
    print(f"\n📥 Importing {os.path.basename(filepath)}...")
    
    with open(filepath, 'r') as f:
        workflow = json.load(f)
    
    # Create workflow via POST
    response = requests.post(
        f"{BASE_URL}/api/v1/workflows",
        headers=headers,
        json=workflow
    )
    
    if response.status_code == 200:
        data = response.json()
        workflow_id = data.get('id') or (data.get('data', {}).get('id') if 'data' in data else None)
        workflow_name = data.get('name') or workflow.get('name', 'Unknown')
        print(f"✅ Successfully imported: {workflow_name} (ID: {workflow_id})")
        return workflow_id
    else:
        print(f"❌ Error importing workflow: {response.status_code}")
        print(f"Response: {response.text}")
        return None

# Import sub-workflows first
script_dir = os.path.dirname(os.path.abspath(__file__))
read_subworkflow_id = import_workflow(os.path.join(script_dir, "google-sheets-read-subworkflow.json"))
write_subworkflow_id = import_workflow(os.path.join(script_dir, "google-sheets-write-subworkflow.json"))

if read_subworkflow_id and write_subworkflow_id:
    # Update main workflow with actual sub-workflow IDs
    main_workflow_path = os.path.join(script_dir, "google-sheets-mcp-workflow.json")
    with open(main_workflow_path, 'r') as f:
        main_workflow = json.load(f)
    
    # Update workflow IDs in tool nodes
    for node in main_workflow['nodes']:
        if node.get('name') == 'Read Sheet Tool':
            node['parameters']['workflowId'] = read_subworkflow_id
        elif node.get('name') == 'Write Sheet Tool':
            node['parameters']['workflowId'] = write_subworkflow_id
    
    # Import main workflow
    main_workflow_id = import_workflow(main_workflow_path)
    
    if main_workflow_id:
        print(f"\n✅ All workflows imported successfully!")
        print(f"\n📋 Next steps:")
        print(f"1. Go to n8n UI and configure Google Sheets credentials")
        print(f"2. Create Bearer Auth credential: 'Google Sheets MCP Bearer Auth' with token 'sheets-mcp-token-2024'")
        print(f"3. Activate workflow ID: {main_workflow_id}")
        print(f"4. Copy the Production MCP URL from the MCP Server Trigger node")
        print(f"5. Update .cursor/mcp.json with the actual MCP URL")
    else:
        print("\n❌ Failed to import main workflow")
        sys.exit(1)
else:
    print("\n❌ Failed to import sub-workflows")
    sys.exit(1)

