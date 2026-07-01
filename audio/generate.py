#!/usr/bin/env python3
"""
Generate ALL guided-meditation audio for Transmute using a licensed, premium
neural voice (Google Cloud Text-to-Speech).

Why this approach
-----------------
The audio is generated ONCE here and shipped as static .mp3 files in /audio.
At runtime every user just streams those static files for free (only CDN
bandwidth, pennies) and the service worker caches them for offline use — so the
cost does NOT scale with the number of users. The only spend is this one-time
generation, which for ~150 short clips is a few cents.

We use Google Cloud TTS because, unlike edge-tts (the previous engine), the
generated audio is **licensed for redistribution in a commercial product** —
required for a Play Store launch. Amazon Polly long-form / generative voices are
an equally good licensed alternative (see NOTES at the bottom).

Setup
-----
1.  pip install google-cloud-texttospeech
2.  Create a Google Cloud project, enable the "Cloud Text-to-Speech API",
    create a service-account key (JSON), then:
        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json   (mac/linux)
        setx  GOOGLE_APPLICATION_CREDENTIALS  C:\\path\\to\\key.json   (windows)
3.  python audio/generate.py
        --force        regenerate even if a file already exists
        --voice NAME   override the voice (default below)

The output filenames match the audio keys the app expects (see MED_LIBRARY /
_audioMap in index.html): welcome, phase_1..5, p1_s01.., and the new
breath_*, orbit_*, scan_* sets. Drop the .mp3s into /audio and they light up
automatically.
"""

import argparse
import os
import sys

OUT = os.path.dirname(os.path.abspath(__file__))

# --- Voice ----------------------------------------------------------------
# Calm, natural British male narration. Best→good options (all redistributable):
#   en-GB-Studio-B          – Studio (broadcast narration, the most natural)
#   en-GB-Chirp3-HD-Charon  – newest ultra-natural HD line
#   en-GB-Neural2-B / -D    – solid, widely available neural voices
# Studio/Chirp give the warmest "guided meditation" delivery; Neural2 is a safe
# fallback if Studio isn't enabled on your project.
DEFAULT_VOICE = 'en-GB-Wavenet-D'  # warm, deep British male — chosen for a grounded, relaxing feel
LANGUAGE_CODE = 'en-GB'
SPEAKING_RATE = 0.76   # slow + calm for meditation (1.0 = normal)
PITCH = -5.5           # noticeably lower/deeper, for a grounding delivery

WELCOME = 'Welcome. Take a slow breath, and let the day begin to settle behind you.'

# Each meditation: prefix used in the audio keys, the phase-announcement lines,
# and every step's spoken text. These mirror MED_PHASES / MED_BREATH /
# MED_ORBIT / MED_SCAN in index.html — keep them in sync if you edit a script.
MEDITATIONS = {
    # Transmutation keeps the original flat keys (welcome, phase_N, pN_sNN) so
    # regenerating overwrites the old edge-tts files in place.
    '': {
        'phases': [
            'Phase one. Grounding.',
            'Phase two. Acknowledging the energy.',
            'Phase three. The upward draw.',
            'Phase four. Transmutation.',
            'Phase five. Integration.',
        ],
        'steps': [
            [
                'Find a comfortable position... sit tall, and let your hands rest easy on your knees...',
                'And gently... let your eyes close...',
                'Take a slow breath in...',
                'Hold it gently...',
                'And breathe all the way out... slowly... completely...',
                'Again... breathe in...',
                'Hold...',
                'And release...',
                'One more time... a full breath in...',
                'Hold...',
                'And let everything go...',
                'With every breath, feel the body growing heavier... softer... more at ease...',
                'You are safe here. Nothing to fix, nowhere to be... just this.',
            ],
            [
                'Now... bring a soft awareness to your lower belly... just below the navel...',
                'Without judgement, simply notice... any warmth... any tension... any quiet stirring...',
                'Whatever is here... let it be welcome...',
                'This is nothing to fight... and nothing to suppress...',
                'This is your life force... raw, and powerful... simply waiting to be directed...',
                'If you wish, rest a hand over your lower belly... and feel the warmth of your own energy...',
                'You are not your urges. You are the calm awareness that watches them rise, and pass...',
            ],
            [
                'Now, we begin to move this energy...',
                'On your next breath in, imagine a warm golden light... gathering at the base of your spine...',
                'Breathe in...',
                'Feel the light rise... through the belly... the solar plexus... warming you from within...',
                'And breathe out, slowly...',
                'Again... breathe in deeply...',
                'The light rises into your heart... opening the chest... filling you with warmth...',
                'And exhale...',
                'Once more, breathe in...',
                'The light climbs higher... through the throat... behind the eyes... to the crown of the head...',
                'As you exhale, let it pour from the crown... radiating outward... as clear, bright light...',
                'Now continue in your own rhythm... drawing the light up as you breathe in... releasing it from the crown as you breathe out...',
                'Beautiful... just keep breathing...',
            ],
            [
                'Now, with the energy flowing freely upward... set a single intention...',
                'What will you build with this power...',
                'A vision... a goal... a piece of work... the man you are becoming...',
                'Let it take shape behind your eyes... clear, and bright...',
                'See it in detail... and feel it as though it is already real...',
                'On your next breath in, draw that golden energy upward once more...',
                'And pour it straight into the vision... charging it with your life force...',
                'Feel it growing solid... vivid... inevitable...',
                'The energy you chose not to spend... is becoming the life you are building...',
                'Breathe in... and send still more into the vision...',
                'Breathe out... and feel it grow stronger...',
                'Hold that feeling. This is what transmutation feels like...',
            ],
            [
                'Now, let the vision gently soften, and fade...',
                'Let the light settle into a quiet warmth... spreading through your whole body...',
                'Rest in the stillness... and the quiet power within you...',
                'This energy is yours now. It was not wasted... it was invested...',
                'Take a slow, deep breath in...',
                'And release...',
                'Once more, breathe in...',
                'And let go...',
                'Gently begin to return your awareness to the room around you...',
                'Softly wiggle your fingers... and your toes...',
                'And when you are ready... slowly open your eyes...',
                'Well done. You chose to transmute rather than drain. That is the work. Carry this stillness with you.',
            ],
        ],
    },
    'breath': {
        'phases': ['Settle.', 'Follow the breath.', 'Return.'],
        'steps': [
            [
                'Settle into a comfortable seat... spine tall... shoulders soft and low...',
                'And gently let your eyes close...',
                'Take one slow breath in through the nose...',
                'And a long, smooth breath out...',
                'Again, breathe in...',
                'And out... letting the body settle a little deeper.',
            ],
            [
                'Now let the breath find its own natural rhythm... nothing to control.',
                'Rest your attention wherever the breath is clearest... the tip of the nose... or the gentle rise and fall of the belly.',
                'Feel this breath in...',
                'And this breath out...',
                'If it helps, quietly count each breath out... one...',
                'Two... three... up to ten... then simply begin again at one.',
                'When you notice the mind has wandered, and it will, gently, without judgement, return to the breath.',
                'There is nowhere to be but here... with this one breath.',
                'Keep following the breath in your own time...',
            ],
            [
                'Gently let go of the counting... and simply sit.',
                'Notice how the body feels now... a little quieter... a little clearer.',
                'Take one deeper breath in...',
                'And release.',
                'When you are ready, let your eyes open... and carry this steadiness with you.',
            ],
        ],
    },
    'orbit': {
        'phases': ['Gather.', 'Up the spine.', 'The orbit.', 'Store.'],
        'steps': [
            [
                'Sit tall, and let your eyes close... rest the tip of your tongue lightly on the roof of your mouth, just behind the teeth. This bridges the circuit.',
                'Take a few slow breaths down into the lower belly.',
                'Breathe in...',
                'And out... feeling a soft warmth gather a few inches below the navel.',
                'This warm centre is your lower dantian... the reservoir of your energy.',
            ],
            [
                'On the next breath in, draw that warmth down to the base of the spine... then begin to lift it...',
                'Up along the spine... the lower back... between the shoulder blades...',
                'Higher still... up the back of the neck... to the crown of the head.',
                'Let it pause there, and quietly glow at the crown.',
            ],
            [
                'Now, as you breathe out, let the energy flow down the front of the body...',
                'Down through the forehead... the throat... the chest...',
                'Down through the belly... and home to the warm centre below the navel.',
                'That is one full orbit. Let it settle for a moment.',
                'Now continue on your own... up the spine as you breathe in...',
                'And down the front as you breathe out...',
                'Round and round... one smooth, unbroken circle of energy.',
            ],
            [
                'Let the orbit slow... and bring the energy to rest in the centre below the navel.',
                'Rest a hand there if you wish... sealing the energy in. Let it be stored, not spent.',
                'Take a slow breath in...',
                'And out.',
                'When you are ready, open your eyes... and carry this charged stillness into your day.',
            ],
        ],
    },
    'scan': {
        'phases': ['Settle.', 'The scan.', 'Stillness.'],
        'steps': [
            [
                'Lie down, or sit comfortably... and let your eyes close.',
                'Take a slow breath in...',
                'And a long breath out... letting your whole body grow heavier.',
                'There is nothing to do now... but notice... and soften.',
            ],
            [
                'Bring your attention to your feet... feel them... and let them soften completely.',
                'Move up through the lower legs... the knees... the thighs... releasing each in turn.',
                'Soften the hips... and the whole base of the body.',
                'Let the belly relax... and the lower back release.',
                'Soften the chest... and feel the breath move it gently.',
                'Let the shoulders drop... falling away from the ears.',
                'Soften the arms... all the way down through the hands and fingers.',
                'Relax the neck... the jaw... the muscles around the eyes... and the forehead.',
                'And let the crown of the head soften too.',
            ],
            [
                'Now feel the whole body at once... heavy... warm... completely at rest.',
                'Rest here in the stillness... nothing to fix... nothing to chase.',
                'Stay as long as you like... and when you are ready, gently deepen the breath...',
                'And slowly let your eyes open... carrying this calm with you.',
            ],
        ],
    },
}


def build_jobs():
    """Return [(key, text), ...] for every clip the app expects."""
    jobs = []
    for prefix, med in MEDITATIONS.items():
        p = (prefix + '_') if prefix else ''        # '' -> legacy flat keys
        jobs.append((f'{p}welcome', WELCOME))
        for i, line in enumerate(med['phases'], start=1):
            jobs.append((f'{p}phase_{i}', line))
        for pi, steps in enumerate(med['steps'], start=1):
            for si, text in enumerate(steps, start=1):
                jobs.append((f'{p}p{pi}_s{si:02d}', text))
    return jobs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true', help='regenerate existing files')
    ap.add_argument('--voice', default=DEFAULT_VOICE, help='Google Cloud voice name')
    args = ap.parse_args()

    try:
        from google.cloud import texttospeech
    except ImportError:
        sys.exit('Missing dependency. Run:  pip install google-cloud-texttospeech')

    client = texttospeech.TextToSpeechClient()
    voice = texttospeech.VoiceSelectionParams(language_code=LANGUAGE_CODE, name=args.voice)
    audio_cfg = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=SPEAKING_RATE,
        pitch=PITCH,
    )

    jobs = build_jobs()
    print(f'Generating {len(jobs)} clips with {args.voice} ...\n')
    made = 0
    for key, text in jobs:
        path = os.path.join(OUT, f'{key}.mp3')
        if not args.force and os.path.exists(path) and os.path.getsize(path) > 1000:
            print(f'  skip {key}.mp3')
            continue
        resp = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=voice, audio_config=audio_cfg,
        )
        with open(path, 'wb') as f:
            f.write(resp.audio_content)
        made += 1
        print(f'  OK   {key}.mp3  ({len(resp.audio_content)//1024}KB)')

    print(f'\nDone. {made} new clip(s) written to {OUT}')


if __name__ == '__main__':
    main()

# -------------------------------------------------------------------------
# NOTES — alternative licensed engines (pick ONE; all allow shipping the audio):
#
#   Amazon Polly (long-form/generative voices are superb for meditation):
#       pip install boto3 ; configure AWS creds
#       polly = boto3.client('polly')
#       r = polly.synthesize_speech(Text=text, OutputFormat='mp3',
#               VoiceId='Arthur', Engine='long-form')   # Arthur = British male
#       open(path,'wb').write(r['AudioStream'].read())
#
#   ElevenLabs (highest quality; needs a PAID plan for commercial redistribution):
#       use their /v1/text-to-speech/{voice_id} endpoint, save the mp3.
#
# Because generation is one-time and the files are static, total cost for the
# whole ~150-clip set is a few cents on any of these — and $0 per user at runtime.
