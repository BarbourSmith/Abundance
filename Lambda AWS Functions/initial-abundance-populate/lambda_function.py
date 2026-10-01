import boto3
import os
import json


def lambda_handler(event: any, context: any):

    # create a dynamodb client
    dynamodb = boto3.resource("dynamodb")
    # get the item from the table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)

    returnObject = {}

    for x in event["repos"]:
        try:
            owner = x["owner"]
            repoName = x["repoName"]
            ranking = x["ranking"]
            forks = x["forks"]
            topMoleculeID = x.get("topMoleculeID", "")
            topics = x["topics"]
            readMe = x["readme"]
            contentURL = x["contentURL"]
            svgURL = x["svgURL"]
            dateCreated = x["dateCreated"]

            table.put_item(Item={"owner": owner, "repoName": repoName, "ranking": ranking, "forks": forks, "topMoleculeID": topMoleculeID,
                           "svgURL": svgURL, "topics": topics, "readMe": readMe, "dateCreated": dateCreated, "contentURL": contentURL})
            returnObject['statusCode'] = 200
            message = "Success populate"
        except:
            returnObject['statusCode'] = 400
            message = 'no'

    returnObject["body"] = json.dumps(message)
    returnObject['headers'] = {}
    returnObject['headers']['Content-Type'] = 'application/json'
    returnObject['headers']['Access-Control-Allow-Headers'] = '*'
    returnObject['headers']['Access-Control-Allow-Methods'] = '*'
    returnObject['headers']['Access-Control-Allow-Origin'] = '*'

    return returnObject
