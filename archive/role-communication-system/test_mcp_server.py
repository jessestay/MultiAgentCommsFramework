from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import json
import asyncio

app = FastAPI()

async def event_generator():
    # Initial connection
    yield f"data: {json.dumps({'method': 'connection', 'status': 'ready'})}\n\n"
    await asyncio.sleep(0.1)
    
    # Tools message - alternative format
    tools_msg = {
        'method': 'register_tools',
        'tools': [{
            'name': 'greet',
            'description': 'Say hello',
            'parameters': {
                'type': 'object',
                'properties': {
                    'name': {
                        'type': 'string',
                        'description': 'Name to greet'
                    }
                }
            }
        }]
    }
    yield f"data: {json.dumps(tools_msg)}\n\n"
    await asyncio.sleep(0.1)

    # Resources message - alternative format
    resources_msg = {
        'method': 'register_resources',
        'resources': {
            'greetings': ['Hello!', 'Hi there!']
        }
    }
    yield f"data: {json.dumps(resources_msg)}\n\n"

    while True:
        await asyncio.sleep(30)
        yield f"data: {json.dumps({'method': 'ping'})}\n\n"

@app.get("/sse")
async def sse():
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

@app.post("/jsonrpc")
async def jsonrpc(request: Request):
    data = await request.json()
    if data.get("method") == "greet":
        name = data.get("params", {}).get("name", "World")
        return {"result": f"Hello, {name}!"}

if __name__ == "__main__":
    import uvicorn
    print("Starting MCP Server on http://localhost:3100")
    uvicorn.run(app, host="127.0.0.1", port=3100) 