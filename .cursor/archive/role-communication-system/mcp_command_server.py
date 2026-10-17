import json
import sys
import time
import logging
import os
import msvcrt
from typing import Dict, Any

# Get absolute paths for log files
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
MESSAGE_LOG = os.path.join(WORKSPACE_DIR, 'message_log.txt')
ERROR_LOG = os.path.join(WORKSPACE_DIR, 'error_log.txt')

print(f"Message log will be written to: {MESSAGE_LOG}")
print(f"Error log will be written to: {ERROR_LOG}")

# Configure logging before anything else
logging.basicConfig(
    filename='mcp_server.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Also log to console with color
class ColorFormatter(logging.Formatter):
    COLORS = {
        'DEBUG': '\033[0;36m',    # Cyan
        'INFO': '\033[0;32m',     # Green
        'WARNING': '\033[0;33m',  # Yellow
        'ERROR': '\033[0;31m',    # Red
        'CRITICAL': '\033[0;35m', # Magenta
        'RESET': '\033[0m'        # Reset
    }

    def format(self, record):
        color = self.COLORS.get(record.levelname, self.COLORS['RESET'])
        record.msg = f"{color}{record.msg}{self.COLORS['RESET']}"
        return super().format(record)

console_handler = logging.StreamHandler(sys.stderr)
console_handler.setLevel(logging.DEBUG)
console_formatter = ColorFormatter('%(asctime)s - %(levelname)s - %(message)s')
console_handler.setFormatter(console_formatter)
logging.getLogger().addHandler(console_handler)

def write_message(msg: Dict[Any, Any]) -> None:
    try:
        # Format JSON with no whitespace
        json_str = json.dumps(msg, separators=(',',':')) + '\n'
        
        # Log the exact message being sent
        with open(MESSAGE_LOG, 'a', encoding='utf-8') as f:
            f.write(f"Sending: {json_str}")
        
        # Write to stdout as bytes
        sys.stdout.buffer.write(json_str.encode('utf-8'))
        sys.stdout.buffer.flush()
    except Exception as e:
        with open(ERROR_LOG, 'a') as f:
            f.write(f"Error: {e}\n")

def read_input() -> str:
    buffer = []
    while True:
        if msvcrt.kbhit():  # Check if there's input available
            char = msvcrt.getwch()
            if char == '\r':  # Enter key
                return ''.join(buffer)
            buffer.append(char)
        time.sleep(0.1)  # Small delay to prevent CPU spinning

def main():
    # Clear previous logs
    open(MESSAGE_LOG, 'w').close()
    open(ERROR_LOG, 'w').close()

    try:
        # Set console title
        if sys.platform == 'win32':
            os.system('title MCP Server')
        
        logging.info("MCP server starting...")
        logging.debug(f"Python version: {sys.version}")
        logging.debug(f"Platform: {sys.platform}")
        logging.debug(f"stdin isatty: {sys.stdin.isatty()}")
        logging.debug(f"stdout isatty: {sys.stdout.isatty()}")
        logging.debug(f"Current directory: {os.getcwd()}")
        
        # Send initial connection message
        logging.info("Sending connection message...")
        write_message({
            "jsonrpc": "2.0",
            "method": "connection",
            "params": {
                "status": "ready"
            }
        })

        # Send tools message
        logging.info("Sending tools message...")
        write_message({
            "jsonrpc": "2.0",
            "method": "tools",
            "params": {
                "tools": [{
                    "name": "hello",
                    "description": "Says hello",
                    "parameters": {
                        "type": "object",
                        "required": ["name"],
                        "properties": {
                            "name": {
                                "type": "string"
                            }
                        }
                    }
                }]
            }
        })

        # Send resources message
        logging.info("Sending resources message...")
        write_message({
            "jsonrpc": "2.0",
            "method": "resources",
            "params": {
                "resources": {
                    "greetings": ["Hello", "Hi", "Hey"]
                }
            }
        })

        # Keep track of last ping time
        last_ping = time.time()
        logging.info("Entering main loop...")

        while True:
            try:
                # Send ping every 10 seconds
                if time.time() - last_ping > 10:
                    logging.debug("Sending ping...")
                    write_message({"jsonrpc": "2.0", "method": "ping"})
                    last_ping = time.time()

                # Read input with timeout
                if sys.stdin.isatty():
                    line = sys.stdin.readline()
                else:
                    import select
                    if select.select([sys.stdin], [], [], 1.0)[0]:
                        line = sys.stdin.readline()
                        with open(MESSAGE_LOG, 'a', encoding='utf-8') as f:
                            f.write(f"Received: {line}")
                    else:
                        continue

                if not line:
                    continue

                logging.debug(f"Processing input line: {line.strip()}")
                request = json.loads(line.strip())
                logging.info(f"Received request: {request}")
                
                if request.get("method") == "hello":
                    name = request.get("params", {}).get("name", "World")
                    write_message({
                        "jsonrpc": "2.0",
                        "id": request.get("id"),
                        "result": f"Hello, {name}!"
                    })

            except json.JSONDecodeError as e:
                with open(ERROR_LOG, 'a') as f:
                    f.write(f"JSON decode error: {str(e)}\n")
                write_message({
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32700,
                        "message": "Parse error"
                    }
                })
            except Exception as e:
                with open(ERROR_LOG, 'a') as f:
                    f.write(f"Error: {str(e)}\n")
                write_message({
                    "jsonrpc": "2.0",
                    "error": {
                        "code": -32603,
                        "message": str(e)
                    }
                })

    except Exception as e:
        with open(ERROR_LOG, 'a') as f:
            f.write(f"Fatal error: {str(e)}\n")
        logging.error(f"Fatal error: {str(e)}", exc_info=True)
        raise

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        with open(ERROR_LOG, 'a') as f:
            f.write(f"Fatal error: {e}\n")
        logging.error("Fatal error in main", exc_info=True)
        sys.exit(1) 