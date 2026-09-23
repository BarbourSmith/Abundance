import boto3
import os
import json
from boto3.dynamodb.conditions import Attr
from boto3.dynamodb.conditions import Key
import decimal


def lambda_handler(event: any, context: any):
    """
    Lambda function: queryReturnLikedProjects
    
    Purpose:
    Fetches fresh project data for a user's liked projects using a two-table architecture.
    Retrieves stale project references from the user table, then batch-fetches current
    project data from the dedicated projects table to ensure up-to-date information.
    
    Input (Query Parameters):
    - user (string): The username of the user whose liked projects to fetch
      Example: ?user=alzatin
    
    Process:
    1. Query user table to retrieve the user's likedProjects array (list of {owner, repoName})
    2. Extract owner and repoName from each liked project object
    3. Batch fetch all project items from abundance-projects table using the keys
    4. Return fresh project data with current values (names, descriptions, stats, etc)
    
    Output (Response):
    - Status 200 (Success): JSON object { "repos": [array of fresh project items] }
    - Status 200 (No liked projects): JSON object { "repos": [] }
    - Status 400 (Error): Error message as string
    
    Response Format Example:
    {
        "statusCode": 200,
        "body": "{\"repos\": [{\"owner\": \"user\", \"repoName\": \"project\", ...}, ...]}"
    }
    
    Dependencies:
    - Environment variables: TABLE_NAME (user table), PROJECTS_TABLE_NAME (projects table)
    - DynamoDB batch_get_item for efficient multi-item retrieval
    """

    # Helper class to convert a DynamoDB item to JSON.
    class DecimalEncoder(json.JSONEncoder):
        def default(self, o):
            if isinstance(o, decimal.Decimal):
                if o % 1 > 0:
                    return float(o)
                else:
                    return int(o)
            return super(DecimalEncoder, self).default(o)

    def build_response(status_code, body):
        return {
            'statusCode': status_code,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': "*"
            },
            'body': json.dumps(body, cls=DecimalEncoder)
        }

    def lookForLast():
        if lastKey:
            lastKeyList = lastKey.split("~")
            lastKeyObj = {"repoName": lastKeyList[0], "owner": lastKeyList[1]}
            return lastKeyObj
        else:
            # need to change to null
            return None

    # create a dynamodb client
    dynamodb = boto3.resource("dynamodb")
    # get the user table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)
    # Get the projects table to fetch fresh project data
    projects_table_name = os.environ["PROJECTS_TABLE_NAME"]
    projects_table = dynamodb.Table(projects_table_name)

    # Get user from query parameters
    user = event["queryStringParameters"]['user']

    item_array = []

    try:
        # Query user table to get their likedProjects
        user_response = table.get_item(Key={'user': user})
        if 'Item' not in user_response:
            return build_response(200, {'repos': []})

        likedProjects = user_response['Item'].get('likedProjects', [])

        # Build keys to batch fetch from projects table
        keys_to_fetch = []
        for project in likedProjects:
            owner = project.get('owner')
            repoName = project.get('repoName')
            if owner and repoName:
                keys_to_fetch.append({
                    'owner': owner,
                    'repoName': repoName
                })

        # Batch fetch all projects from abundance-projects table
        if keys_to_fetch:
            response = dynamodb.batch_get_item(
                RequestItems={
                    projects_table_name: {
                        'Keys': keys_to_fetch
                    }
                }
            )
            item_array = response.get('Responses', {}).get(
                projects_table_name, [])

            print(len(item_array))

        return build_response(200, {'repos': item_array})
    except Exception as e:
        print('Error', e)
        return build_response(400, str(e))
