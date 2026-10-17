import requests
import pandas as pd
import time
import os
import json
import base64
import base58
import concurrent.futures

# Create directory for CSVs
os.makedirs('token_holders', exist_ok=True)

# Token information
tokens = [
    {"name": "PONKE", "address": "5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC"},
    {"name": "Waffles", "address": "8doS8nzmgVZEaACxALkbK5fZtw4UuoRp4Yt8NEaXfDMb"},
    {"name": "DUKO", "address": "HLptm5e6rTgh4EKgDpYFrnRHbjpkMyVdEeREEa2G7rf9"},
    {"name": "Hood", "address": "h5NciPdMZ5QCB5BYETJMYBMpVx9ZuitR6HcVjyBhood"}
]

# RPC endpoints (using multiple for redundancy)
RPC_ENDPOINTS = [
    "https://api.mainnet-beta.solana.com",
    "https://solana-api.projectserum.com",
    "https://rpc.ankr.com/solana",
    "https://ssc-dao.genesysgo.net"
]

def get_token_holders_direct_rpc(token_address):
    """Use Solana RPC directly to get token holders"""
    print(f"Using direct Solana RPC to fetch holders for {token_address}")
    
    # Try each endpoint until one works
    for endpoint in RPC_ENDPOINTS:
        try:
            print(f"Trying RPC endpoint: {endpoint}")
            
            # First get mint info to get decimals
            mint_data = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getAccountInfo",
                "params": [
                    token_address,
                    {"encoding": "jsonParsed"}
                ]
            }
            
            response = requests.post(endpoint, json=mint_data, headers={
                "Content-Type": "application/json"
            }, timeout=30)
            
            if response.status_code != 200:
                print(f"Error: RPC returned status {response.status_code}")
                continue
                
            result = response.json()
            if "result" not in result or not result["result"]["value"]:
                print(f"Error: Invalid response from RPC for mint info")
                continue
                
            # Extract decimals
            try:
                decimals = result["result"]["value"]["data"]["parsed"]["info"]["decimals"]
                print(f"Token has {decimals} decimals")
            except:
                print("Could not get decimals, assuming 9")
                decimals = 9
            
            # Get all token accounts for this mint
            largest_accounts_data = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTokenLargestAccounts",
                "params": [token_address]
            }
            
            response = requests.post(endpoint, json=largest_accounts_data, headers={
                "Content-Type": "application/json"
            }, timeout=30)
            
            if response.status_code != 200:
                print(f"Error: RPC returned status {response.status_code}")
                continue
                
            result = response.json()
            if "result" not in result or "value" not in result["result"]:
                print(f"Error: Invalid response from RPC for largest accounts")
                continue
                
            token_accounts = result["result"]["value"]
            print(f"Found {len(token_accounts)} token accounts, retrieving details...")
            
            # Process each account to get owner info
            holders = []
            
            # Function to get account info - will use in parallel processing
            def get_account_info(account):
                try:
                    account_data = {
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getAccountInfo",
                        "params": [
                            account["address"],
                            {"encoding": "jsonParsed"}
                        ]
                    }
                    
                    response = requests.post(endpoint, json=account_data, headers={
                        "Content-Type": "application/json"
                    }, timeout=30)
                    
                    if response.status_code != 200:
                        print(f"Error: RPC returned status {response.status_code}")
                        return None
                        
                    result = response.json()
                    if "result" not in result or not result["result"]["value"]:
                        return None
                        
                    # Extract owner
                    try:
                        owner = result["result"]["value"]["data"]["parsed"]["info"]["owner"]
                        amount = int(result["result"]["value"]["data"]["parsed"]["info"]["tokenAmount"]["amount"])
                        ui_amount = float(result["result"]["value"]["data"]["parsed"]["info"]["tokenAmount"]["uiAmount"])
                        
                        return {
                            "address": owner,
                            "amount": amount,
                            "decimal_amount": ui_amount
                        }
                    except:
                        print(f"Could not extract owner from account {account['address']}")
                        return None
                except Exception as e:
                    print(f"Error getting account info: {e}")
                    return None
            
            # Process accounts in parallel to speed things up
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = {executor.submit(get_account_info, account): account for account in token_accounts}
                for future in concurrent.futures.as_completed(futures):
                    holder = future.result()
                    if holder:
                        holders.append(holder)
            
            print(f"Successfully processed {len(holders)} token accounts")
            
            # Add the mint account as well (it could be a holder too)
            try:
                return sorted(holders, key=lambda x: x["amount"], reverse=True)[:500]
            except Exception as e:
                print(f"Error sorting holders: {e}")
                return holders[:500]
                
        except Exception as e:
            print(f"Error with RPC endpoint {endpoint}: {e}")
            continue
    
    print("All RPC endpoints failed")
    return []

def try_helius_api(token_address):
    """Try Helius.xyz API to get token holders"""
    print(f"Trying Helius API for {token_address}")
    
    try:
        # This is a free plan API key with limited usage
        api_key = "1f240442-cabc-4079-9cfb-f5297c359eb9"
        url = f"https://api.helius.xyz/v0/tokens/{token_address}/holders?api-key={api_key}"
        
        response = requests.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            holders = []
            
            if "holderAddresses" in data:
                for holder in data["holderAddresses"]:
                    holders.append({
                        "address": holder["owner"],
                        "amount": int(holder["amount"]),
                        "decimal_amount": float(holder["amount"]) / (10 ** int(data.get("decimals", 9)))
                    })
                
                print(f"Found {len(holders)} holders via Helius API")
                return holders[:500]
            else:
                print("No holder data in Helius API response")
                return None
        else:
            print(f"Helius API error: Status {response.status_code}")
            return None
    except Exception as e:
        print(f"Helius API error: {e}")
        return None

def try_solscan_api(token_address):
    """Try Solscan API to get token holders"""
    print(f"Trying Solscan API for {token_address}")
    
    try:
        url = f"https://api.solscan.io/token/holders?token={token_address}&offset=0&limit=100"
        
        response = requests.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            holders = []
            
            if "data" in data and "result" in data["data"]:
                for holder in data["data"]["result"]:
                    address = holder.get("owner", "")
                    amount = holder.get("amount", 0)
                    decimals = int(holder.get("decimals", 9))
                    
                    holders.append({
                        "address": address,
                        "amount": int(amount),
                        "decimal_amount": float(amount) / (10 ** decimals)
                    })
                
                print(f"Found {len(holders)} holders via Solscan API")
                return holders[:500]
            else:
                print("No holder data in Solscan API response")
                return None
        else:
            print(f"Solscan API error: Status {response.status_code}")
            return None
    except Exception as e:
        print(f"Solscan API error: {e}")
        return None

def process_token(token):
    token_name = token["name"]
    token_address = token["address"]
    
    print(f"\nProcessing {token_name} ({token_address})...")
    
    # Try different methods
    holders = try_helius_api(token_address)
    
    if not holders:
        holders = try_solscan_api(token_address)
    
    if not holders:
        # This is the most reliable but slowest method
        holders = get_token_holders_direct_rpc(token_address)
    
    if holders:
        # Create DataFrame
        df = pd.DataFrame(holders)
        
        # Sort by amount (descending)
        df = df.sort_values(by='amount', ascending=False)
        
        # Take top 500 holders
        df = df.head(500)
        
        # Save to CSV
        csv_filename = f"token_holders/{token_name}_top_holders.csv"
        df.to_csv(csv_filename, index=False)
        
        print(f"✅ Saved {len(df)} {token_name} holders to {csv_filename}")
        return True
    else:
        print(f"❌ No holder data found for {token_name} after trying all methods")
        return False

def main():
    results = []
    
    for token in tokens:
        success = process_token(token)
        results.append({
            "token": token["name"],
            "success": success
        })
        print("-" * 50)
    
    # Summary
    print("\nSummary:")
    print("-" * 50)
    for result in results:
        status = "✅ Success" if result["success"] else "❌ Failed"
        print(f"{result['token']}: {status}")

if __name__ == "__main__":
    main()