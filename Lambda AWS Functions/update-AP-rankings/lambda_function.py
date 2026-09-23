import os
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal


"""
Recalculates project rankings based on two independent metrics:

1. RANKING (1-5 tier based on molecule usage):
   - Scans all projects and counts how many times each molecule is used
   - Calculates molecule usage for each project
   - Converts to 1-5 tier: 0→1, 1-9→2, 10-49→3, 50-99→4, 100+→5
   - Used by ranking-dateModified-index for featured project queries

2. USER_RANKING (engagement score):
   - Scans user table and tallies likes for each project (from likedProjects)
   - Calculates: userRanking = 2 * likes + 0.2 * forks
   - Represents user engagement and project popularity

3. LIKES (count):
   - Stores the tally of likes for each project from user table
   - Used in userRanking calculation and stored for reference

Safe Updates:
   - Uses update_item with UpdateExpression (only updates 3 fields)
   - Preserves all other project metadata (description, topics, urls, etc.)
   - Skips "My-First-Project" as requested

Requirements:
   - TABLE_NAME environment variable: abundance-projects
   - USER_TABLE environment variable: user table name
   - Requires full table scans on both projects and users table

Returns:
   {statusCode: 200, body: "Updated ranking for N projects."}
"""


def compute_molecule_usage_counts(items):
    """Returns a dict mapping repo_id to usage count."""
    usage_counts = {}
    for item in items:
        print(item)
        molecules = item.get("githubMoleculesUsed", [])
        print(molecules)
        for molecule in molecules:
            print(molecule)
            if molecule:
                repo_id = f"{molecule['owner']}/{molecule['repoName']}"
                usage_counts[repo_id] = usage_counts.get(repo_id, 0) + 1
    return usage_counts


def tally_likes_from_user_table(dynamodb, user_table_name):
    user_table = dynamodb.Table(user_table_name)
    likes_count = {}
    response = user_table.scan(ProjectionExpression="likedProjects")
    items = response.get("Items", [])
    while "LastEvaluatedKey" in response:
        response = user_table.scan(
            ProjectionExpression="likedProjects",
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        items.extend(response.get("Items", []))
    for user in items:
        liked_projects = user.get("likedProjects", [])
        for proj in liked_projects:
            owner = None
            repo_name = None
            if isinstance(proj, dict):
                owner = proj.get("owner")
                repo_name = proj.get("repoName")
            elif isinstance(proj, str) and "/" in proj:
                owner, repo_name = proj.split("/", 1)

            if not owner or not repo_name:
                missing = []
                if not owner:
                    missing.append("owner")
                if not repo_name:
                    missing.append("repoName")

                print(
                    f"Skipping invalid liked project (missing {', '.join(missing)}): {proj}")
                continue
            key = (owner, repo_name)
            likes_count[key] = likes_count.get(key, 0) + 1
    # After likes_count is built
    top_liked = sorted(likes_count.items(),
                       key=lambda x: x[1], reverse=True)[:3]
    print("Top 3 liked projects:")
    for (owner, repo_name), count in top_liked:
        print(f"{owner}/{repo_name}: {count} likes")
    return likes_count


def get_molecule_usage_for_project(owner, repo_name, usage_counts):
    repo_id = f"{owner}/{repo_name}"
    return usage_counts.get(repo_id, 0)


def batch_update_items(table, updates):
    """Update items in DynamoDB one at a time (update_item preserves other attributes)."""
    for update in updates:
        table.update_item(
            Key={"owner": update["owner"], "repoName": update["repoName"]},
            UpdateExpression="SET ranking = :r, userRanking = :ur, likes = :l",
            ExpressionAttributeValues={
                ":r": update["ranking"],
                ":ur": update["userRanking"],
                ":l": update["likes"]
            },
        )


def calculate_molecule_ranking(molecule_usage):
    """Calculate ranking as 1-5 bucket based on molecule usage.

    Buckets:
    - 1: 0 uses
    - 2: 1-9 uses
    - 3: 10-49 uses
    - 4: 50-99 uses
    - 5: 100+ uses
    """
    molecule_usage = int(molecule_usage)

    if molecule_usage == 0:
        return 1
    elif molecule_usage < 10:
        return 2
    elif molecule_usage < 50:
        return 3
    elif molecule_usage < 100:
        return 4
    else:
        return 5


def calculate_user_ranking(item):
    """Calculate ranking based on likes and forks only."""
    # Ensure all values are Decimal for DynamoDB compatibility
    likes = Decimal(str(item.get("likes", 0)))
    forks = Decimal(str(item.get("forks", 0)))
    # User ranking: 2 * likes + 0.2 * forks
    user_ranking = Decimal('2') * likes + Decimal('0.2') * forks
    return user_ranking


def lambda_handler(event, context):
    dynamodb = boto3.resource("dynamodb")
    table_name = os.environ["TABLE_NAME"]
    user_table_name = os.environ["USER_TABLE"]
    table = dynamodb.Table(table_name)

    # 1. Scan all items
    items = []
    response = table.scan()
    items.extend(response.get("Items", []))
    while "LastEvaluatedKey" in response:
        response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
        items.extend(response.get("Items", []))

    # 2. Compute molecule usage counts
    molecule_usage_counts = compute_molecule_usage_counts(items)

    # 3. Tally likes from user table
    likes_count = tally_likes_from_user_table(dynamodb, user_table_name)

    # 4. Prepare batch updates
    updates = []
    updated = 0
    for item in items:
        owner = item["owner"]
        repo_name = item["repoName"]
        # Skip the specific project
        if owner == "alzatin" and repo_name == "My-First-Project":
            print(f"Skipping project {owner}/{repo_name} as requested.")
            continue
        molecule_usage = get_molecule_usage_for_project(
            owner, repo_name, molecule_usage_counts)
        # Use the tally from the user table
        likes = likes_count.get((owner, repo_name), 0)
        forks = item.get("forks", 0)

        molecule_usage = float(molecule_usage)
        item_for_ranking = {"likes": likes, "forks": forks}

        # Calculate both rankings
        ranking = calculate_molecule_ranking(molecule_usage)
        user_ranking = calculate_user_ranking(item_for_ranking)

        print(
            f"Updating {owner}/{repo_name}: ranking={ranking}, userRanking={user_ranking}")

        # Prepare item for batch write
        update_item = {
            "owner": owner,
            "repoName": repo_name,
            "ranking": ranking,
            "userRanking": user_ranking,
            "likes": likes
        }
        updates.append(update_item)
        updated += 1

    # 5. Write all updates
    batch_update_items(table, updates)

    print(f"Updated ranking for {updated} projects.")
    return {
        "statusCode": 200,
        "body": f"Updated ranking for {updated} projects."
    }
