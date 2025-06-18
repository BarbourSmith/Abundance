import boto3
import os
import json
from boto3.dynamodb.conditions import Attr
from boto3.dynamodb.conditions import Key
import decimal
import datetime
from datetime import datetime


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
            lastKeyObj = {"owner": lastKeyList[1], "repoName": lastKeyList[0]}
            print(lastKeyObj)
            return lastKeyObj
        else:
            # need to change to null
            return None

    # create a dynamodb client
    dynamodb = boto3.resource("dynamodb")
    # get the item from the table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)

    user = event['queryStringParameters']['user']
    searchAttribute = event['queryStringParameters']['attribute']
    query = event['queryStringParameters']['query']
    lastKey = event['queryStringParameters']['lastKey']
    year = event['queryStringParameters']['yearShow']

    item_array = []
    # Get the current year
    current_year = datetime.now().year
    # change year to integer
    year = current_year

    try:
        if (user):
            if (query):
                print(query)
                # Define the key condition expression
                scan_args = {
                    'FilterExpression': Attr(searchAttribute).contains(query) & Attr('owner').eq(user)
                }
                response = table.scan(**scan_args)

            else:
                key_condition_expression = Key('owner').eq(user)

                response = table.query(
                    KeyConditionExpression=key_condition_expression)

            item_array.extend(response.get('Items', []))
            print(item_array)

        elif (searchAttribute and query):
            scan_args = {
                'FilterExpression': Attr(searchAttribute).contains(query) & ~(Attr('privateRepo').eq(True)) & ~(Attr('parentRepo').eq('alzatin/my-first-project')),
            }
            response = table.scan(**scan_args)
            item_array.extend(response.get('Items', []))
        else:
            exclusiveKey = lookForLast()
            query_args = {
                'IndexName': 'yyyy-dateCreated-index',
                'KeyConditionExpression': Key('yyyy').eq(year),
                'FilterExpression': ~(Attr('privateRepo').eq(True)) & ~(Attr('parentRepo').eq('alzatin/my-first-project'))
            }
            if exclusiveKey:
                query_args['ExclusiveStartKey'] = exclusiveKey
                print(query_args)
            # response = table.scan(**scan_args)
            response = table.query(**query_args)
            print(response)
            item_array.extend(response.get('Items', []))
            if 0 < len(item_array) < 50:
                # Code to execute if the length of the array is between 1 and 49
                print("Array length is between 0 and 50.")
                year = year - 1
                query_args['KeyConditionExpression'] = Key('yyyy').eq(year)
                response2 = table.query(**query_args)
                item_array.extend(response2.get('Items', []))

        lastKeyForward = ""
        if 'LastEvaluatedKey' in response:
            lastKeyForward = response.get('LastEvaluatedKey')
            print(response.get('LastEvaluatedKey'))

        return build_response(200, {'repos': item_array, "lastKey": lastKeyForward})
    except:
        print('Error')
        return build_response(400, {"error": "Something went wrong"})
