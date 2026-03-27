import boto3
import os
import json
from datetime import datetime


def lambda_handler(event: any, context: any):

    returnObject = {}

    # create a dynamodb client
    dynamodb = boto3.resource("dynamodb")
    # get the item from the table
    table_name = os.environ["TABLE_NAME"]
    table = dynamodb.Table(table_name)

    print("Received event:", event)
    print("Using DynamoDB table:", table_name)
    newDate = str(datetime.now().toordinal())

    try:
        owner = event["owner"]
        description = event["description"]
        repoName = event["repoName"]
        ranking = event["ranking"]
        searchField = event["searchField"]
        forks = event["forks"]
        topMoleculeID = event["topMoleculeID"]
        topics = event["topics"]
        readMe = event["readme"]
        contentURL = event["contentURL"]
        svgURL = event["svgURL"]
        dateCreated = event["dateCreated"]
        parentRepo = event["parentRepo"]
        githubMoleculesUsed = event["githubMoleculesUsed"]
        html_url = event["html_url"]
        dateModified = newDate

        newYear = datetime.now().year

        itemToPut = {"owner": owner,
                     "description": description,
                     "repoName": repoName,
                     "ranking": ranking,
                     "searchField": searchField,
                     "forks": forks,
                     "topMoleculeID": topMoleculeID,
                     "svgURL": svgURL,
                     "topics": topics,
                     "readMe": readMe,
                     "dateCreated": dateCreated,
                     "contentURL": contentURL,
                     "parentRepo": parentRepo,
                     "githubMoleculesUsed": githubMoleculesUsed,
                     "yyyy": newYear,
                     "html_url": html_url,
                     "dateModified": dateModified}

        print("Item to put:", json.dumps(itemToPut))
        response = table.put_item(Item=itemToPut)
        print("DynamoDB put_item response:", response)
        returnObject['statusCode'] = 200
        message = "Success put item"

    except Exception as e:
        print("Exception occurred:", str(e))
        returnObject['statusCode'] = 400
        message = f'Something went wrong: {str(e)}'

    returnObject['headers'] = {}
    returnObject["body"] = json.dumps(message)
    returnObject['headers']['Content-Type'] = 'application/json'

    return returnObject
