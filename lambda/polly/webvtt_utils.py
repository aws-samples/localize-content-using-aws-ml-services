import re


def write_srt(phrases):
    """
    This function will convert the input phrases into an .srt subtitle file formatted text.

    :param phrases: A list of words seperated out in batch of 10 words each along with the timing information
    :return: text blob of the .srt file
    """
    x = 1
    srt_out = ""

    for phrase in phrases:
        # write out the phrase number
        srt_out += str(x) + "\n"
        x += 1

        # write out the start and end time
        srt_out += phrase["start_time"] + " --> " + phrase["end_time"] + "\n"

        # write out the full phase.  Use spacing if it is a word, or punctuation without spacing
        srt_out += get_phrase_text(phrase)

        srt_out += "\n\n"

    return srt_out


def write_web_vtt(phrases, style):
    """
    This function will convert the input phrases into an .vtt subtitle file formatted text.

    :param phrases: A list of words seperated out in batch of 10 words each along with the timing information
    :param style: Styling that needs to be applied to the subtitle file
    :return: text blob of the .vtt file
    """
    x = 1
    vtt_out = ""

    for phrase in phrases:
        # write out the phrase number
        vtt_out += str(x) + "\n"
        x += 1

        # write out the start and end time
        vtt_out += phrase["start_time"] + " --> " + phrase["end_time"] + " " + style + "\n"

        # write out the full phase.  Use spacing if it is a word, or punctuation without spacing
        vtt_out += get_phrase_text(phrase)

        # write out the WebVTT file
        vtt_out += "\n\n"

    return vtt_out


def new_phrase():
    """
    This is a utility function which creates a new phrase structure
    :return: a new phrase object which stores the start time, end time and words between the start and the end time.
    """
    return {'start_time': '', 'end_time': '', 'words': []}


def get_time_code(milliseconds, subtitle_format="srt"):
    """
    Format and return a string that contains the converted number of seconds into SRT/WebVTT format

    :param milliseconds: time information of when a word is spoken
    :param subtitle_format: Whether srt or vtt file format is needed. Default is srt
    :return:
    """
    seconds = milliseconds / 1000
    mod = round(seconds % 1, 3)
    t_hund = int(mod * 1000)
    t_seconds = int(seconds)
    t_secs = round(((float(t_seconds) / 60) % 1) * 60)
    t_mins = int(t_seconds / 60)
    if subtitle_format == "srt":
        return str("%02d:%02d:%02d,%03d" % (00, t_mins, int(t_secs), t_hund))
    elif subtitle_format == "vtt":
        return str("%02d:%02d:%02d.%03d" % (00, t_mins, int(t_secs), t_hund))


def get_speechmarks_to_webvtt(words, transcript):
    """
    This is the core function which combines the words with the timing information and the input text to a subtitle text

    :param words: words list with timing information
    :param transcript: The actual text which was sent to polly
    :return: subtitle text in either vtt or srt format
    """
    # Write the WebVTT file for the original language
    print("==> Creating WebVTT from Speechmarks")
    phrases = get_phrases_from_speechmarks(words, transcript)
    # write_web_vtt(phrases, "A:middle L:90%")
    srt_text = write_srt(phrases)

    return srt_text


def get_phrases_from_speechmarks(words, transcript):
    """
    This function does the heavy lifting of mapping the words in the words list to the text in the transcript, it splits
    the transcript into groups of 10 so that it fits the screen. Then for each of 10 words it calculate the time
    information and creates a phrase object which will store the time information along with the phrases (10 words each)

    :param words: words list with timing information
    :param transcript: The actual text which was sent to polly
    :return: List of phrases each with 10 words and their start and end time
    """


    # Now create phrases from the translation
    # ts = json.loads(transcript)
    items = transcript.split()
    len_items = len(items)
    len_sm = len(words)

    print("length len_items-len_sm", len_items, len_sm)

    # set up some variables for the first pass
    phrase = new_phrase()
    phrases = []
    n_phrase = True
    x = 0
    c = 0

    # print "==> Creating phrases from transcript..."

    for item in items:
        # if it is a new phrase, then get the start_time of the first item
        if n_phrase:
            phrase["start_time"] = get_time_code(words[c]["start_time"])
            n_phrase = False

        else:
            # get the end_time if the item is a pronunciation and store it
            # We need to determine if this pronunciation or punctuation here
            # Punctuation doesn't contain timing information, so we'll want
            # to set the end_time to whatever the last word in the phrase is.

            if c == len(words) - 1:
                phrase["end_time"] = get_time_code(words[c]["start_time"])
            else:
                phrase["end_time"] = get_time_code(words[c + 1]["start_time"] - 1)

        # in either case, append the word to the phrase...
        phrase["words"].append(item)
        x += 1

        # now add the phrase to the phrases, generate a new phrase, etc.
        if x == 10 or c == (len(items) - 1):
            # print c, phrase
            if c == (len(items) - 1):
                if phrase["end_time"] == '':
                    start_time = words[c]["start_time"]
                    end_time = int(start_time) + 500
                    phrase["end_time"] = get_time_code(end_time)

            phrases.append(phrase)
            phrase = new_phrase()
            n_phrase = True
            x = 0

        if c < len(words):
            c += 1

    # if there are any words in the final phrase add to phrases
    if len(phrase["words"]) > 0:
        phrases.append(phrase)

    return phrases


def get_phrase_text(phrase):
    """
    This is a utility function which converts a list of words into a sentence. Uses spacing if it is a word, or punctuation without spacing
    :param phrase: a single phrase, list of 10 words
    :return: a sentence consisting of about 10 words
    """
    length = len(phrase["words"])

    out = ""
    for i in range(0, length):
        #if re.match('[a-zA-Z0-9]', phrase["words"][i]):
            if i > 0:
                out += " " + phrase["words"][i]
            else:
                out += phrase["words"][i]
        #else:
        #    out += phrase["words"][i]

    return out
