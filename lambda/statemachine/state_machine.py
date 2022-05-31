from tokenize import Name
from typing import Type
import boto3
import os

def handler(event, context):
    client = boto3.client('stepfunctions')
    ssm = boto3.client('ssm')
    print(event)
    input_video_file = event['Records'][0]['s3']['object']['key']
    ssm.put_parameter(
        Name='input_video_file',
        Value=input_video_file,
        Type='String',
        Overwrite=True)
    response = client.start_execution(
        stateMachineArn=os.environ.get('STATE_MACHINE_ARN'))