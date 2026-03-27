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

    # Support flexible query modes
    params = event.get('queryStringParameters', {})
    if params is None:
        params = {}
    mode = params.get('mode', 'public')
    user = params.get('user')
    # Default to repoName if not specified
    searchAttribute = params.get('attribute', 'repoName')
    query = params.get('query')
    lastKey = params.get('lastKey')
    year = params.get('yearShow')

    item_array = []
    # Get the current year
    current_year = datetime.now().year
    if not year:
        year = current_year
    else:
        year = int(year)

    try:
        response = None

        if mode == "user" and user:
            # Mode: user - return user's projects (public and private)
            if query:
                # User's projects matching search
                scan_args = {
                    'FilterExpression': (Attr('owner').eq(user)) & (Attr(searchAttribute).contains(query))
                }
                response = table.scan(**scan_args)
                item_array.extend(response.get('Items', []))
            else:
                # All user's projects
                key_condition_expression = Key('owner').eq(user)
                response = table.query(
                    KeyConditionExpression=key_condition_expression)
                item_array.extend(response.get('Items', []))

        elif mode == "all":
            # Mode: all
            if user:
                # All public projects + private projects owned by user
                if query:
                    # Public projects matching query + private projects owned by user matching query
                    scan_args = {
                        'FilterExpression': (
                            (~(Attr('privateRepo').eq(True)) & ~(Attr('repoName').eq(
                                'tutorial-default')) & Attr(searchAttribute).contains(query))
                            | (Attr('owner').eq(user) & Attr(searchAttribute).contains(query))
                        )
                    }
                    response = table.scan(**scan_args)
                    item_array.extend(response.get('Items', []))
                else:
                    # All public projects + private projects owned by user (no search)
                    scan_args = {
                        'FilterExpression': (~Attr('privateRepo').eq(True) & ~Attr('repoName').eq('tutorial-default')) | (Attr('owner').eq(user))
                    }
                    response = table.scan(**scan_args)
                    item_array.extend(response.get('Items', []))
            else:
                # No user specified - return all public projects
                if query:
                    # Public projects matching query
                    scan_args = {
                        'FilterExpression': ~(Attr('privateRepo').eq(True)) & ~(Attr('repoName').eq('tutorial-default')) & Attr(searchAttribute).contains(query)
                    }
                    response = table.scan(**scan_args)
                    item_array.extend(response.get('Items', []))
                else:
                    # All public projects by year
                    exclusiveKey = lookForLast()
                    query_args = {
                        'IndexName': 'yyyy-dateCreated-index',
                        'KeyConditionExpression': Key('yyyy').eq(year),
                        'FilterExpression': ~(Attr('privateRepo').eq(True)) & ~(Attr('repoName').eq('tutorial-default'))
                    }
                    if exclusiveKey:
                        query_args['ExclusiveStartKey'] = exclusiveKey
                    response = table.query(**query_args)
                    item_array.extend(response.get('Items', []))
                    if 0 < len(item_array) < 50:
                        year = year - 1
                        query_args['KeyConditionExpression'] = Key(
                            'yyyy').eq(year)
                        response2 = table.query(**query_args)
                        item_array.extend(response2.get('Items', []))
        else:
            # Default: public projects by year (no specific mode)
            exclusiveKey = lookForLast()
            query_args = {
                'IndexName': 'yyyy-dateCreated-index',
                'KeyConditionExpression': Key('yyyy').eq(year),
                'FilterExpression': ~(Attr('privateRepo').eq(True)) & ~(Attr('repoName').eq('tutorial-default'))
            }
            if exclusiveKey:
                query_args['ExclusiveStartKey'] = exclusiveKey
            response = table.query(**query_args)
            item_array.extend(response.get('Items', []))
            if 0 < len(item_array) < 50:
                year = year - 1
                query_args['KeyConditionExpression'] = Key('yyyy').eq(year)
                response2 = table.query(**query_args)
                item_array.extend(response2.get('Items', []))

        lastKeyForward = ""
        if response and 'LastEvaluatedKey' in response:
            lastKeyForward = response.get('LastEvaluatedKey')

        return build_response(200, {'repos': item_array, "lastKey": lastKeyForward})
    except Exception as e:
        print('Error', e)
        return build_response(400, {"error": "Something went wrong"})
