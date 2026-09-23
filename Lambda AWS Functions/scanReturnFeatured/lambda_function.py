import boto3
import os
import json
from boto3.dynamodb.conditions import Attr
from boto3.dynamodb.conditions import Key
import decimal
import datetime


def lambda_handler(event: any, context: any):
    """
    Queries the DynamoDB abundance-projects table for featured projects.
    Returns the top 15 highest-ranked projects (by userRanking) for each of the 
    current year and the two previous years, excluding private repositories.

    Uses the yyyy-userRanking-index for efficient queries.
    Results are already sorted by userRanking in descending order.

    Returns:
        - statusCode: 200 on success, 400 on error
        - body: JSON array of up to 45 projects (15 per year × 3 years)
    """
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
                'IndexName': 'yyyy-userRanking',
                'KeyConditionExpression': Key('yyyy').eq(y),
                'ScanIndexForward': False,
                'FilterExpression': ~(Attr('privateRepo').eq(True)),
                'Limit': 15
            }
            response = table.query(**query_args)
            item_array.extend(response.get('Items', []))

        # Items are already sorted by userRanking descending per year, no additional sorting needed
        print(item_array)
        return build_response(200, {'repos': item_array})
    except Exception as e:
        print('Error:', e)
        return build_response(400, str(e))
