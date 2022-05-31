import boto3
import os

def handler(event, context):
    client = boto3.client('stepfunctions')
    response = client.start_execution(
        stateMachineArn=os.environ.get('STATE_MACHINE_ARN'))