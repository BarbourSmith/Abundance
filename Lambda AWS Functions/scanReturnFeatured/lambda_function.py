import boto3
import os
import json
from boto3.dynamodb.conditions import Attr
from boto3.dynamodb.conditions import Key
import decimal
import datetime


def lambda_handler(event: any, context: any):

    # Get the current date and time
    now = datetime.datetime.now()
    years = [now.year, now.year - 1, now.year - 2]

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

    # create a dynamodb client
    dynamodb = boto3.resource("dynamodb")
    # get the item from the table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)

    item_array = []

    try:
        for y in years:
            query_args = {
                'IndexName': 'yyyy-ranking-index',
                'KeyConditionExpression': Key('yyyy').eq(y),
                'ScanIndexForward': False,
                'FilterExpression': ~(Attr('privateRepo').eq(True)),
                'Limit': 100
            }
            response = table.query(**query_args)
            item_array.extend(response.get('Items', []))

        # Sort all items by 'ranking' descending and take top 20
        def get_ranking(item):
            # fallback to 0 if ranking is missing
            return float(item.get('ranking', 0))

        item_array_sorted = sorted(item_array, key=get_ranking, reverse=True)
        top_items = item_array_sorted[:150]
        print(top_items)
        return build_response(200, {'repos': top_items})
    except Exception as e:
        print('Error:', e)
        return build_response(400, str(e))
