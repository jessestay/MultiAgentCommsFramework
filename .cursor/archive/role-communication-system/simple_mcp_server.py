from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import asyncio
import json
from datetime import datetime
from typing import Dict, List, Optional
import uvicorn

# Role Communication System Components
class Message:
    def __init__(self, source_role: str, target_role: Optional[str], content: str):
        self.source_role = source_role
        self.target_role = target_role
        self.content = content
        self.timestamp = datetime.utcnow()
        self.id = f"{source_role}-{self.timestamp.isoformat()}"
        self.read = False

class RoleCommunicationManager:
    def __init__(self):
        self.roles = {
            "ES": "Executive Secretary",
            "SET": "Software Engineering Team",
            "MD": "Marketing Director",
            "SMM": "Social Media Manager",
            "CTW": "Copy Technical Writer",
            "BIC": "Business Income Coach",
            "UFL": "Utah Family Lawyer",
            "DLC": "Debt Consumer Law Coach",
            "SE": "Software Engineering Scrum Master",
            "DRC": "Dating Relationship Coach"
        }
        self.messages: Dict[str, List[Message]] = {}
        self.active_roles: Dict[str, bool] = {role: False for role in self.roles}
        
    def format_message(self, msg: Message) -> str:
        if msg.target_role:
            return f"[{msg.source_role}]: @{msg.target_role}: {msg.content}"
        return f"[{msg.source_role}]: {msg.content}"
    
    def add_message(self, msg: Message):
        if msg.target_role:
            key = f"{msg.source_role}-{msg.target_role}"
        else:
            key = msg.source_role
        
        if key not in self.messages:
            self.messages[key] = []
        self.messages[key].append(msg)
        print(f"Message added: {self.format_message(msg)}")

# Initialize the communication manager
comm_manager = RoleCommunicationManager()

app = FastAPI()

async def event_generator():
    print("Client connected - sending initial messages...")
    
    # Send initial connection message
    connection_msg = {
        'jsonrpc': '2.0',
        'method': 'connection',
        'params': {
            'status': 'connected',
            'server': 'Role Communication MCP Server',
            'version': '1.0.0'
        }
    }
    print(f"Sending connection: {json.dumps(connection_msg, indent=2)}")
    yield f"data: {json.dumps(connection_msg)}\n\n"
    await asyncio.sleep(0.1)
    
    # Register tools for role communication
    tools_msg = {
        'jsonrpc': '2.0',
        'method': 'register_tools',
        'params': {
            'tools': [{
                'name': 'send_role_message',
                'description': 'Send a message to a specific role',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'source_role': {
                            'type': 'string',
                            'description': 'The role sending the message'
                        },
                        'target_role': {
                            'type': 'string',
                            'description': 'The role to receive the message'
                        },
                        'content': {
                            'type': 'string',
                            'description': 'The message content'
                        }
                    },
                    'required': ['source_role', 'content']
                }
            }]
        }
    }
    print(f"Sending tools: {json.dumps(tools_msg, indent=2)}")
    yield f"data: {json.dumps(tools_msg)}\n\n"
    await asyncio.sleep(0.1)
    
    # Register resources
    resources_msg = {
        'jsonrpc': '2.0',
        'method': 'register_resources',
        'params': {
            'resources': [{
                'name': 'available_roles',
                'description': 'List of available roles',
                'content': {
                    'roles': comm_manager.roles
                }
            }]
        }
    }
    print(f"Sending resources: {json.dumps(resources_msg, indent=2)}")
    yield f"data: {json.dumps(resources_msg)}\n\n"
    await asyncio.sleep(0.1)
    
    print("Initial messages sent - entering ping loop...")
    
    while True:
        await asyncio.sleep(30)
        ping_msg = {
            'jsonrpc': '2.0',
            'method': 'ping',
            'params': {
                'timestamp': datetime.utcnow().isoformat()
            }
        }
        yield f"data: {json.dumps(ping_msg)}\n\n"

@app.get("/sse")
async def sse_endpoint():
    print("New SSE connection received")
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    )

@app.post("/jsonrpc")
async def jsonrpc_endpoint(request: Request):
    try:
        data = await request.json()
        print(f"Received JSON-RPC request: {json.dumps(data, indent=2)}")
        
        if data["method"] == "send_role_message":
            params = data["params"]
            msg = Message(
                source_role=params["source_role"],
                target_role=params.get("target_role"),
                content=params["content"]
            )
            comm_manager.add_message(msg)
            response = {
                "jsonrpc": "2.0",
                "result": {
                    "status": "success",
                    "formatted_message": comm_manager.format_message(msg)
                },
                "id": data.get("id")
            }
            print(f"Sending response: {json.dumps(response, indent=2)}")
            return response
            
    except Exception as e:
        error_msg = str(e)
        print(f"Error processing request: {error_msg}")
        return {
            "jsonrpc": "2.0",
            "error": {
                "code": -32700,
                "message": error_msg
            },
            "id": None
        }

if __name__ == "__main__":
    print("=== Role Communication MCP Server starting ===")
    print("Server URL: http://localhost:3100/sse")
    print("Available roles:", ", ".join(comm_manager.roles.keys()))
    print("Waiting for connections...")
    uvicorn.run(app, host="0.0.0.0", port=3100) 