import boto3
import os
import json
from boto3.dynamodb.conditions import Attr
from boto3.dynamodb.conditions import Key
import decimal
import logging
from botocore.exceptions import ClientError


logger = logging.getLogger(__name__)


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

    # create a dynamodb client
    dynamodb = boto3.resource("dynamodb")
    # get the item from the table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)

    parameters = event.get('queryStringParameters') or {}
    user = parameters.get('user')
    queryLiked = parameters.get('liked', '').lower() == 'true'
    if not isinstance(user, str) or not user.strip():
        logger.warning("Missing user in query")
        return build_response(400, "A user is required")

    item_array = []

    try:

        if (user):
            key_condition_expression = Key('user').eq(user)

            response = table.query(
                KeyConditionExpression=key_condition_expression,
                ConsistentRead=True)
            item_array.extend(response.get('Items', []))

            if (queryLiked):
                liked_repos = {
                    'repos': item_array[0].get('likedProjects', []) if item_array else []
                }

                return build_response(200, liked_repos)
            else:
                return build_response(200,  item_array)

    except ClientError as e:
        logger.exception("Failed to query user")
        return build_response(500, "Could not load user")
