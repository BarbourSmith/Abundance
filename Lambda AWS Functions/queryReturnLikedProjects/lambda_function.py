import boto3
import os
import json
from boto3.dynamodb.conditions import Attr
from boto3.dynamodb.conditions import Key
import decimal


def lambda_handler(event: any, context: any):

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
    # get the item from the table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)

    likedProjects = event["multiValueQueryStringParameters"]['likedProjects']

    item_array = []

    try:
        for item in likedProjects:
            splitItem = item.split("/")
            owner = splitItem[0]
            repoName = splitItem[1]

            # Use the DynamoDB Table resource get item method to get a single item
            response = table.get_item(
                Key={
                    'owner': owner,
                    'repoName': repoName
                }
            )

            item_array.append(response["Item"])
        print(item_array)

        return build_response(200, {'repos': item_array})
    except:
        print('Error')
        return build_response(400, e.response['Error']['Message'])
