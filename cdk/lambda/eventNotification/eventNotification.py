# import json
# import boto3
# import os

# appsync = boto3.client('appsync')
# api_id = os.environ['APPSYNC_API_ID']
# api_key = os.environ['APPSYNC_API_KEY']

# def lambda_handler(event, context):
#     channel = '/default/embeddings'
#     message = {
#         "channel": channel,
#         "events": [
#             json.dumps({"message": "Embeddings created successfully", "sessionId": event['sessionId']})
#         ]
#     }

#     response = appsync.publish(
#         apiId=api_id,
#         payload=json.dumps(message)
#     )

#     return {
#         'statusCode': 200,
#         'body': json.dumps('Event published')
#     }
import json
import os
import requests

def lambda_handler(event, context):
    try:
        session_id = event.get('sessionId')
        if not session_id:
            return {
                "statusCode": 400,
                "body": json.dumps("Missing sessionId in the event payload.")
            }
        
        message = event.get('message', "Embeddings created successfully")
        
        url = f"https://{os.environ['APPSYNC_API_ID']}.appsync-api.{os.environ['REGION']}.amazonaws.com/graphql"
        headers = {
            "Content-Type": "application/json",
            "x-api-key": os.environ["APPSYNC_API_KEY"],
        }
        payload = {
            "query": """
                mutation sendNotification($message: String!, $sessionId: String!) {
                    sendNotification(message: $message, sessionId: $sessionId) {
                        message
                        sessionId
                    }
                }
            """,
            "variables": {
                "message": message,
                "sessionId": session_id,
            },
        }

        response = requests.post(url, headers=headers, json=payload)
        response_json = response.json()

        # if response.status_code != 200 or "errors" in response.json():
        #     raise Exception(f"Error publishing event: {response.json()}")
        if response.status_code != 200 or "errors" in response_json:
            return {
                'statusCode': response.status_code,
                'body': json.dumps({
                    "error": response_json.get("errors", "Unknown error"),
                    "details": response_json
                })
            }

        return {
            'statusCode': 200,
            'body': json.dumps({
                "message": "Event published successfully.",
                "response": response_json
            })
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                "error": str(e)
            })
        }