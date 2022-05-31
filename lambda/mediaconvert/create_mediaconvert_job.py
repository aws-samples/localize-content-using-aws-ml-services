import boto3
import json
import os
import uuid

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
    mediaconvert_video_filename = os.environ.get('MC_VIDEO_FILENAME')

    target_audio_mp3 = 's3://' + bucket + '/' + event[0]['audio_file_destination'].rsplit('/', 1)[-1]
    target_subtitle_file = 's3://' + bucket + '/' + event[1]['srt_file_name']
    input_file_path = 's3://' + bucket + '/' + mediaconvert_video_filename
    destination_path = 's3://' + bucket + '/convertedaudio/' + mediaconvert_video_filename[:mediaconvert_video_filename.index(".")]
    
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
    