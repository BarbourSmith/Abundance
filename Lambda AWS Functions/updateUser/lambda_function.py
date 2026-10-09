import boto3
import os
import json
import datetime
import logging
from botocore.exceptions import ClientError


logger = logging.getLogger(__name__)
MAX_UPDATE_ATTEMPTS = 5


def build_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    user = event.get("user")
    update_type = event.get("updateType")
    updates = event.get("attributeUpdates")
    if (
        not isinstance(user, str) or not user.strip()
        or update_type not in ("SET", "REMOVE")
        or not isinstance(updates, dict) or not updates
        or any(not isinstance(key, str) or not key for key in updates)
        or "user" in updates or "dateModified" in updates
        or (update_type == "REMOVE" and set(updates) != {"likedProjects"})
    ):
        logger.warning("Invalid user update request")
        return build_response(400, "Invalid user update request")

    requested_likes = updates.get("likedProjects")
    if "likedProjects" in updates and (
        not isinstance(requested_likes, list) or not requested_likes
        or any(
            not isinstance(project, dict)
            or not isinstance(project.get("owner"), str)
            or not project["owner"].strip()
            or not isinstance(project.get("repoName"), str)
            or not project["repoName"].strip()
            for project in requested_likes
        )
    ):
        logger.warning("Invalid likedProjects update")
        return build_response(400, "Each liked project must have owner and repoName")

    table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
    new_date = datetime.datetime.now().strftime("%m/%d/%Y")
    try:
        for attempt in range(MAX_UPDATE_ATTEMPTS):
            names = {"#date": "dateModified"}
            values = {":date": new_date, ":zero": 0}
            expressions = ["#date = :date"]
            if "numProjectsOwned" not in updates:
                names["#owned"] = "numProjectsOwned"
                expressions.append("#owned = if_not_exists(#owned, :zero)")
            condition = None

            for index, (key, value) in enumerate(updates.items()):
                name, token = f"#field{index}", f":value{index}"
                names[name] = key
                if key == "likedProjects":
                    item = table.get_item(
                        Key={"user": user},
                        ConsistentRead=True,
                        ProjectionExpression="#likes",
                        ExpressionAttributeNames={"#likes": "likedProjects"},
                    ).get("Item", {})
                    previous = item.get("likedProjects", [])
                    targets = {
                        (project["owner"], project["repoName"])
                        for project in requested_likes
                    }
                    # Replace only the target entries, preserving all other likes.
                    next_likes = [
                        project for project in previous
                        if (project["owner"], project["repoName"]) not in targets
                    ]
                    if update_type == "SET":
                        next_likes.extend(
                            {"owner": owner, "repoName": repo}
                            for owner, repo in sorted(targets)
                        )
                    values[token] = next_likes
                    if "likedProjects" in item:
                        condition = f"{name} = :previous"
                        values[":previous"] = previous
                    else:
                        condition = f"attribute_not_exists({name})"
                    expressions.append(f"{name} = {token}")
                elif key == "numProjectsOwned":
                    values[token] = 1
                    expressions.append(f"{name} = if_not_exists({name}, :zero) + {token}")
                else:
                    values[token] = value
                    expressions.append(f"{name} = {token}")

            if "likedProjects" not in updates:
                names["#likes"] = "likedProjects"
                values[":empty"] = []
                expressions.append("#likes = if_not_exists(#likes, :empty)")
            request = {
                "Key": {"user": user},
                "UpdateExpression": "SET " + ", ".join(expressions),
                "ExpressionAttributeNames": names,
                "ExpressionAttributeValues": values,
            }
            if condition:
                request["ConditionExpression"] = condition
            try:
                table.update_item(**request)
                return build_response(200, "SET OR REMOVE COMPLETE")
            except ClientError as error:
                if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
                    raise
                logger.info("Retrying concurrent likedProjects update (attempt %s)", attempt + 1)
    except ClientError:
        logger.exception("Failed to update user")
        return build_response(500, "Could not update user")

    logger.warning("Concurrent likedProjects updates exceeded retry limit")
    return build_response(409, "Project likes changed concurrently. Please try again.")
