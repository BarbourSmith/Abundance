
import boto3
import os
import json
import datetime


def lambda_handler(event: any, context: any):

    returnObject = {}

    # create a dynamodb client
    dynamodb = boto3.resource("dynamodb")
    # get the item from the table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)

    owner = event["owner"]
    repoName = event["repoName"]
    print(event)

    # for every item in the body coming from abundance (a.e. ranking: 5), add a key value pair to expression attribute values
    # you have not connected to api gateway

    # Format dateModified as ISO 8601 to match GitHub API format (dateCreated uses created_at)
    newDate = datetime.datetime.now().isoformat() + 'Z'
    updateExpressions = []
    for key, value in event["attributeUpdates"].items():
        if (key == "ranking"):
            updateExpressions.append(f'{key} = {key} + :{key}')
        else:
            updateExpressions.append(f'{key} = :{key}')
    print(updateExpressions)

    expressionAttributeValues = {
        ':dateModified': newDate
    }
    for key, value in event["attributeUpdates"].items():
        expressionAttributeValues[":"+key] = value

    response = table.update_item(
        Key={
            'owner': owner,
            'repoName': repoName
        },
        UpdateExpression='SET dateModified = :dateModified, ' +
        ", ".join(updateExpressions),
        ExpressionAttributeValues=expressionAttributeValues
    )

    returnObject['statusCode'] = 200
    returnObject['headers'] = {}
    returnObject["body"] = json.dumps("hello")
    returnObject['headers']['Content-Type'] = 'application/json'

    return returnObject
