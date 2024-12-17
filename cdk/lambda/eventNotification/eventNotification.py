import json
import os
import boto3

APPSYNC_API_URL = os.environ["APPSYNC_API_URL"]
APPSYNC_API_KEY = os.environ["APPSYNC_API_KEY"]
APPSYNC_API_ID = os.environ["APPSYNC_API_ID"]

def lambda_handler(event, context):
#working##########################
    print(f"Event Received: {json.dumps(event)}")

    try:
        # Extract arguments from the AppSync payload
        arguments = event.get("arguments", {})
        session_id = arguments.get("sessionId", "DefaultSessionId")
        message = arguments.get("message", "Default message")

        # Log the extracted values for debugging
        print(f"Extracted sessionId: {session_id}, message: {message}")

        # Return the values back to AppSync
        return {
            "sessionId": session_id,
            "message": message
        }

    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "error": str(e)
        }

    #############################################
    # print(f"Event Received: {json.dumps(event)}")

    # try:
    #     # Extract sessionId and message
    #     session_id = event.get("sessionId", "DefaultSessionId")
    #     message = event.get("message", "Default message")

    #     # Log values
    #     print(f"Extracted sessionId: {session_id}, message: {message}")

    #     # Build the mutation query
    #     query = """
    #     mutation sendNotification($message: String!, $sessionId: String!) {
    #         sendNotification(message: $message, sessionId: $sessionId) {
    #             message
    #             sessionId
    #         }
    #     }
    #     """
    #     headers = {
    #         "Content-Type": "application/json",
    #         "x-api-key": APPSYNC_API_KEY
    #     }
    #     payload = {
    #         "query": query,
    #         "variables": {
    #             "message": message,
    #             "sessionId": session_id
    #         }
    #     }

    #     # Send POST request to AppSync
    #     with httpx.Client() as client:
    #         response = client.post(APPSYNC_API_URL, headers=headers, json=payload)
    #         response_data = response.json()
    #         print(f"AppSync Response: {json.dumps(response_data)}")

    #     # Return successful response
    #     return {
    #         "sessionId": session_id,
    #         "message": message
    #     }

    # except Exception as e:
    #     print(f"Error: {str(e)}")
    #     return {
    #         'error': str(e)
    #     }