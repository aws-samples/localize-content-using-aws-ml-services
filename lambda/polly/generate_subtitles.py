import boto3
import os
import json
from webvtt_utils import *

def handler(event, context):
    
    s3 = boto3.resource('s3')
    bucket = os.environ.get('BUCKET_NAME')
    polly_language_code = os.environ.get('POLLY_LANGUAGE_CODE')
    polly_voice_id = os.environ.get('POLLY_VOICE_ID')
    polly_text_file = os.environ.get('POLLY_TEXT_FILE')
    speechmarks_file = event['speechmarks_file_destination']
    # Read the text from the file
    with open(polly_text_file, 'r') as file:
        polly_text = file.read().replace('\n', '')

    speech_marks_json = convert_text_to_jsonarray(bucket, speechmarks_file)

    words = []
    # sentences = []
    for data in speech_marks_json:
        item = {}

        if data["type"] == 'word':
            if data["value"].find("break") > -1:
                continue
            word = data["value"].split(" ")
            for w in word:
                item["start_time"] = data["time"]
                item["word"] = w
                words.append(item)

    speech_marks_text = get_speechmarks_to_webvtt(words, polly_text)
    text_key = polly_language_code + "-" + polly_voice_id + "-" + event['Payload'] + ".srt"

    bucket = s3.Bucket(bucket)
    bucket.put_object(Body=speech_marks_text, ContentType="text/plain", Key=text_key)
    
    return {'result':'success', 'srt_file_name': text_key}

def convert_text_to_jsonarray(bucket_name, srt_s3_uri):
    """
    This is a utility function to convert the speechmarks output to a json object

    :param s3_uri: S3 URI for the speeckmarks file
    :param bucket_name: S3 bucket name
    :return:
    """

    try:
        s3 = boto3.resource('s3')
        bucket = s3.Bucket(bucket_name)

        speechmarks_file_key = srt_s3_uri.rsplit('/', 1)[-1]

        srt_file = bucket.Object(key=speechmarks_file_key)

        srt_bytes = srt_file.get()

        print(srt_bytes)

        srt_in = srt_bytes['Body'].read()
        srt_contents = str(srt_in, 'utf-8')

        lines = srt_contents.split("\n")

        print(lines)

        speech_marks_json = []

        for line in lines:
            if line != '':
                json_line = json.loads(line)
                speech_marks_json.append(json_line)

        return speech_marks_json

    except Exception as e:
        print("Issue reading phrase file: ", srt_s3_uri, e)