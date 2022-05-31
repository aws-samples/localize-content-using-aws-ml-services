import boto3
import os

def handler(event, context):
    bucket = os.environ.get('BUCKET_NAME')
    polly_language_code = os.environ.get('POLLY_LANGUAGE_CODE')
    polly_voice_id = os.environ.get('POLLY_VOICE_ID')
    polly_text_file = os.environ.get('POLLY_TEXT_FILE')
    target_language_code = os.environ.get('TARGET_LANG_CODE')
    polly_engine = os.environ.get('POLLY_ENGINE')

    # Read the text from the file
    with open(polly_text_file, 'r') as file:
        polly_text = file.read().replace('\n', '')

    # Set up the polly and translate services
    client = boto3.client('polly')

    # Use the translated text to create the synthesized speech
    response = client.start_speech_synthesis_task(Engine=polly_engine, LanguageCode=polly_language_code, OutputFormat="mp3",
                                                  SampleRate="22050", Text=polly_text, VoiceId=polly_voice_id,
                                                  TextType="text",
                                                  OutputS3BucketName=bucket,
                                                  OutputS3KeyPrefix=target_language_code + "-polly-recording")
    return response['SynthesisTask']['TaskId']