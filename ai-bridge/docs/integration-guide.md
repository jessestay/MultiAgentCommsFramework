# AI Bridge Integration Guide

This guide explains how to integrate the AI Bridge with your projects.

## Overview

The AI Bridge can be integrated with any project that needs secure AI interactions, with support for both local and cloud AI processing. This guide covers:

1. How to set up the AI Bridge as a dependency
2. Creating symlinks to the AI Bridge
3. Configuring your application to use the AI Bridge
4. Example integrations

## Integration Methods

There are three main ways to integrate the AI Bridge with your project:

### Method 1: Direct Symlinks (Recommended for AutomaticJesse Projects)

This method creates symbolic links to the AI Bridge, allowing multiple projects to use the same instance.

#### Setup Steps:

1. Create a batch file similar to the example below:

```batch
@echo off
echo Creating symbolic links for the AI Bridge...

REM Replace the existing AI Bridge in your project with a symlink to the dedicated AI Bridge
rmdir /S /Q "C:\path\to\your\project\ai-bridge" 2>nul
mklink /D "C:\path\to\your\project\ai-bridge" "C:\Users\stay\OneDrive\Documents\Github Repos\ai-bridge"

echo Symlinks created successfully!
pause
```

2. Run the batch file with administrator privileges
3. Verify the symlink was created correctly

### Method 2: Git Submodule

For Git-based projects, you can add the AI Bridge as a submodule.

```bash
# Navigate to your project directory
cd your-project

# Add the AI Bridge as a submodule
git submodule add https://github.com/yourusername/ai-bridge.git ai-bridge

# Initialize and update the submodule
git submodule update --init --recursive
```

### Method 3: Package Dependency

You can also install the AI Bridge as a package dependency (recommended for Python projects).

1. Add the AI Bridge to your `requirements.txt`:

```
git+https://github.com/yourusername/ai-bridge.git@main
```

2. Install the dependency:

```bash
pip install -r requirements.txt
```

## Client Configuration

### Python Client Example

Here's how to configure a Python client to use the AI Bridge:

```python
import requests
import json

class AIBridgeClient:
    def __init__(self, base_url="http://localhost:5000"):
        self.base_url = base_url
        
    def generate_text(self, prompt, max_tokens=100, temperature=0.7):
        response = requests.post(
            f"{self.base_url}/generate",
            json={
                "prompt": prompt,
                "max_tokens": max_tokens,
                "temperature": temperature
            }
        )
        
        if response.status_code == 200:
            return response.json()["generated_text"]
        else:
            raise Exception(f"Error from AI Bridge: {response.text}")

# Usage example
client = AIBridgeClient()
result = client.generate_text("Write a short poem about technology")
print(result)
```

### JavaScript Client Example

For JavaScript/Node.js applications:

```javascript
const axios = require('axios');

class AIBridgeClient {
  constructor(baseUrl = 'http://localhost:5000') {
    this.baseUrl = baseUrl;
  }
  
  async generateText(prompt, maxTokens = 100, temperature = 0.7) {
    try {
      const response = await axios.post(`${this.baseUrl}/generate`, {
        prompt,
        max_tokens: maxTokens,
        temperature
      });
      
      return response.data.generated_text;
    } catch (error) {
      throw new Error(`Error from AI Bridge: ${error.response?.data || error.message}`);
    }
  }
}

// Usage example
const client = new AIBridgeClient();
client.generateText('Write a short poem about technology')
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

## Project-Specific Configuration

### AutomaticJesse Framework Projects

For projects within the AutomaticJesse framework:

1. Ensure the symlinks are properly set up using the batch file
2. Import the AI Bridge client in your project
3. Create an instance of the client in your application's initialization

```python
# In your project's main.py or similar
from ai_bridge.client import AIBridgeClient

ai_client = AIBridgeClient()

# Then use it in your application
result = ai_client.generate_text("Your prompt here")
```

### Facebook Growth AI Integration

For the Facebook Growth AI project:

1. The AI Bridge is already integrated via symlink
2. Use the bridge by importing from the ai-bridge directory:

```python
from ai_bridge.client import AIBridgeClient

ai_client = AIBridgeClient()
```

## Advanced Configuration

### Custom Routing Rules

To define custom routing rules for your project:

1. Create a `routing_config.py` file in your project
2. Define your routing rules based on your specific needs
3. Pass the configuration to the AI Bridge client:

```python
from ai_bridge.client import AIBridgeClient

# Custom rules
custom_rules = {
    "default_provider": "cloud",
    "sensitive_content": "local",
    "max_tokens_local": 2000
}

ai_client = AIBridgeClient(routing_rules=custom_rules)
```

### Environment Variables

You can configure the AI Bridge through environment variables:

```
AI_BRIDGE_URL=http://localhost:5000
AI_BRIDGE_DEFAULT_PROVIDER=local
AI_BRIDGE_API_KEY=your-api-key
```

## Troubleshooting

### Common Issues

1. **Connection refused**: Ensure the AI Bridge server is running
2. **Symlink errors**: Check that symlinks are correctly created and have the proper permissions
3. **Module not found**: Verify that the AI Bridge is properly installed or symlinked

### Logging

To enable detailed logging for troubleshooting:

```python
import logging
logging.basicConfig(level=logging.DEBUG)

# Then initialize the client
ai_client = AIBridgeClient()
```

## Security Considerations

When integrating the AI Bridge:

1. Never store API keys in your code; use environment variables
2. Consider network security for the bridge (it's recommended to run it locally)
3. Review the sanitization rules to ensure they meet your project's needs
4. Regularly update the AI Bridge to get the latest security patches

---

*Created by: Executive Secretary (ES)*  
*Last Updated: March 19, 2025* 