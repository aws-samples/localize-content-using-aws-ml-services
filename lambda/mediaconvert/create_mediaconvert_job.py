import boto3
import json
import os
import uuid
import time


def handler(event, context):
    """
    This function creates a media convert job to combine the original video, new language polly audio
    and new subtitle file. It uses the mc-job-settings.json file to store some of the settings for creating media
    convert job, then on the fly some properties in this file are changed to match properties such as
    language codes , input video, subtitle files based on the current execution and input parameters
    """

    bucket = os.environ.get('BUCKET_NAME')
    mediaconvert_role_arn = os.environ.get('MC_ROLE_ARN')
    lang_short = os.environ.get('MC_LANG_SHORT')
    lang_long = os.environ.get('MC_LANG_LONG')
    target_language_code = os.environ.get('TARGET_LANG_CODE')
    region = os.environ.get('AWS_REGION')
    uid = event[0]['Payload']['uid']
    distribution_id = os.environ.get('CDN_DISTRIBUTION')

    ssm = boto3.client('ssm')
    mediaconvert_video_filename_response = ssm.get_parameter(Name='input_video_file')
    mediaconvert_video_filepath = mediaconvert_video_filename_response['Parameter']['Value']
    mediaconvert_video_filename = mediaconvert_video_filepath.rsplit('/', 1)[-1]

    target_audio_mp3 = f"s3://{bucket}/{uid}/synthesisOutput/{event[0]['Payload']['audio_file_destination'].rsplit('/', 1)[-1]}"
    target_subtitle_file = f"s3://{bucket}/{event[1]['srt_file_name']}"
    input_file_path = f"s3://{bucket}/{mediaconvert_video_filepath}"
    destination_path = f's3://{bucket}/{uid}/convertedAV/{mediaconvert_video_filename[:mediaconvert_video_filename.index(".")]}'
    cdn_url = f"https://{os.environ.get('CDN_DOMAIN')}/{uid}/convertedAV/{mediaconvert_video_filename[:mediaconvert_video_filename.index('.')]}.m3u8"

    #Update the play_video.html with actual value
    write_into_file(bucket, cdn_url, distribution_id)
    
    with open('mc-job-settings.json') as json_file:
        mc_data = json.load(json_file)

    mc_data['Settings']['Inputs'][0]['CaptionSelectors']['Captions Selector 1']['SourceSettings']['FileSourceSettings'][
        'SourceFile'] = target_subtitle_file

    temp_audio_selector = {"Tracks": [1], "Offset": 0, "DefaultSelection": "DEFAULT", "SelectorType": "TRACK",
                           "ExternalAudioFileInput": target_audio_mp3, "ProgramSelection": 0}
    mc_data["Settings"]["Inputs"][0]["AudioSelectors"]["Audio Selector 1"] = temp_audio_selector

    mc_data['Settings']['OutputGroups'][0]['OutputGroupSettings']['HlsGroupSettings'][
        'Destination'] = destination_path
    mc_data['Settings']['Inputs'][0]['FileInput'] = input_file_path

    # Captions

    mc_data["Settings"]["OutputGroups"][0]["Outputs"][1]["NameModifier"] = "_sub_" + target_language_code
    mc_data["Settings"]["OutputGroups"][0]["Outputs"][1]["CaptionDescriptions"][0]["LanguageCode"] = lang_short
    mc_data["Settings"]["OutputGroups"][0]["Outputs"][1]["CaptionDescriptions"][0]["LanguageDescription"] = lang_long

    # Audio

    mc_data["Settings"]["OutputGroups"][0]["Outputs"][4]["NameModifier"] = "_" + target_language_code
    mc_data["Settings"]["OutputGroups"][0]["Outputs"][4]["AudioDescriptions"][0]["StreamName"] = lang_long
    mc_data["Settings"]["OutputGroups"][0]["Outputs"][4]["AudioDescriptions"][0]["LanguageCode"] = lang_short

    asset_id = str(uuid.uuid4())
    job_metadata = {'asset_id': asset_id, 'application': "createMediaConvertJob"}
    mc_client = boto3.client('mediaconvert', region_name=region)
    endpoints = mc_client.describe_endpoints()
    mc_endpoint_url = endpoints['Endpoints'][0]['Url']
   
    mc = boto3.client('mediaconvert', region_name=region, endpoint_url=mc_endpoint_url, verify=True)
   
    mc.create_job(Role=mediaconvert_role_arn, UserMetadata=job_metadata, Settings=mc_data["Settings"])
    
"""
Function to update the static html with the new cdn url
"""
def write_into_file(bucket, cdn_url, distribution_id):
    output = ''
    with open("play_video.html", "r") as sources_file:
        # Read all the lines
        lines = sources_file.readlines()
        # Rewind and truncate

        # Loop through the lines, adding them back to the file.
        for line in lines:
            # Find the source line in file and update it with the new cdn url
            if "<source src=" in line:
                output += f'<source src="{cdn_url}" type="application/x-mpegurl" />\n'
            else:
                output += line + "\n"
    
    s3 = boto3.resource('s3')
    s3.Object(bucket,f'inputVideo/play_video.html').put(Body=output,ContentType='text/html')

    # Invlidate the cache so that the new video would be fecthed when this file is accessed again
    cloudfront = boto3.client('cloudfront')
    cloudfront.create_invalidation(
        DistributionId=distribution_id,
        InvalidationBatch={
            'Paths': {
                'Quantity': 1,
                'Items': [
                    '/inputVideo/play_video.html'
                    ],
            },
            'CallerReference': str(time.time()).replace(".", "")
        }
    )