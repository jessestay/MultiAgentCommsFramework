"""
Social Media Growth AI - FastAPI Server
"""
import os
from typing import Dict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Create FastAPI app
app = FastAPI(
    title="Social Media Growth AI",
    description="AI-powered social media content management and automation",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root() -> Dict[str, str]:
    """Root endpoint returning API information."""
    return {
        "name": "Social Media Growth AI",
        "version": "1.0.0",
        "status": "operational"
    }

@app.get("/health")
async def health_check() -> Dict[str, str]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "debug": os.getenv("DEBUG", "False")
    }

if __name__ == "__main__":
    import uvicorn
    
    host = os.getenv("HOST", "localhost")
    port = int(os.getenv("PORT", 8000))
    
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=True if os.getenv("DEBUG", "False").lower() == "true" else False
    ) 