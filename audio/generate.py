#!/usr/bin/env python3
"""Generate all meditation audio using Microsoft Edge Neural TTS (en-GB-RyanNeural)."""

import asyncio, edge_tts, os

OUT = os.path.dirname(os.path.abspath(__file__))
VOICE = 'en-GB-RyanNeural'
RATE  = '-22%'
PITCH = '-5Hz'

STEPS = [
    # Phase announcements
    ('phase_1', 'Phase one. Grounding.'),
    ('phase_2', 'Phase two. Acknowledging the Energy.'),
    ('phase_3', 'Phase three. The Upward Draw.'),
    ('phase_4', 'Phase four. Transmutation.'),
    ('phase_5', 'Phase five. Integration.'),

    # Phase 1 — Grounding
    ('p1_s01', 'Find a comfortable position... sit with your spine long and tall... let your hands rest gently on your knees...'),
    ('p1_s02', 'Close your eyes...'),
    ('p1_s03', 'Take a slow breath in...'),
    ('p1_s04', 'Hold gently...'),
    ('p1_s05', 'And breathe all the way out... slowly... completely...'),
    ('p1_s06', 'Again... breathe in...'),
    ('p1_s07', 'Hold...'),
    ('p1_s08', 'And release...'),
    ('p1_s09', 'One more time... deep breath in...'),
    ('p1_s10', 'Hold...'),
    ('p1_s11', 'And let it all go...'),
    ('p1_s12', 'Feel your body becoming heavier... more relaxed... with each breath...'),
    ('p1_s13', 'You are safe... you are still... nothing needs to happen right now...'),

    # Phase 2 — Acknowledging the Energy
    ('p2_s01', 'Now... bring your gentle awareness to your lower belly... just below your navel...'),
    ('p2_s02', 'Without judgement... simply notice... is there any warmth there... any tension... any stirring...'),
    ('p2_s03', 'Whatever you feel... it is welcome here...'),
    ('p2_s04', 'This is not something to fight... or suppress...'),
    ('p2_s05', 'This is life force energy... raw... powerful... waiting to be directed...'),
    ('p2_s06', 'Place one hand gently on your lower belly if you wish... feel the warmth of your own energy...'),
    ('p2_s07', 'You are not your urges... you are the awareness that observes them...'),

    # Phase 3 — The Upward Draw
    ('p3_s01', 'Now we begin to move this energy...'),
    ('p3_s02', 'On your next inhale... imagine a warm golden light... beginning to rise... from the very base of your spine...'),
    ('p3_s03', 'Breathe in...'),
    ('p3_s04', 'Feel the light rise through your belly... your solar plexus... warming from inside...'),
    ('p3_s05', 'Breathe out slowly...'),
    ('p3_s06', 'Again... breathe in deeply...'),
    ('p3_s07', 'The light rises through your heart centre... expanding your chest... filling you with warmth...'),
    ('p3_s08', 'Exhale...'),
    ('p3_s09', 'Breathe in once more...'),
    ('p3_s10', 'The light continues upward... through your throat... your third eye... to the very crown of your head...'),
    ('p3_s11', 'As you exhale... let it radiate outward from your crown... in all directions... as pure white light...'),
    ('p3_s12', 'Continue this with each breath on your own... drawing the light up on every inhale... releasing it from your crown on every exhale...'),
    ('p3_s13', 'Good... keep breathing...'),

    # Phase 4 — Transmutation
    ('p4_s01', 'Now... with your energy flowing freely upward... I want you to set an intention...'),
    ('p4_s02', 'What will you create with this power...'),
    ('p4_s03', 'A vision... a goal... a project... a version of yourself...'),
    ('p4_s04', 'Let it appear at your third eye... between your eyebrows...'),
    ('p4_s05', 'See it clearly... feel it as already real...'),
    ('p4_s06', 'Now on your next inhale... draw that golden energy upward once more...'),
    ('p4_s07', 'And pour it directly into that vision... charge it with your life force...'),
    ('p4_s08', 'Feel it becoming real... vibrant... inevitable...'),
    ('p4_s09', 'This energy that you have chosen not to waste... is becoming the life you are building...'),
    ('p4_s10', 'Breathe in... and send more energy to your vision...'),
    ('p4_s11', 'Exhale... and feel the vision strengthen...'),
    ('p4_s12', 'Hold this feeling... this is what transmutation feels like...'),

    # Phase 5 — Integration
    ('p5_s01', 'Begin to let the vision gently fade...'),
    ('p5_s02', 'Let the light soften... returning to a gentle warmth throughout your whole body...'),
    ('p5_s03', 'Feel the stillness... the quiet power inside you...'),
    ('p5_s04', 'This energy is now yours... it has not been wasted... it has been invested...'),
    ('p5_s05', 'Take a slow deep breath in...'),
    ('p5_s06', 'And release...'),
    ('p5_s07', 'Once more... breathe in...'),
    ('p5_s08', 'And let go...'),
    ('p5_s09', 'Begin to bring your awareness back to the room around you...'),
    ('p5_s10', 'Gently wiggle your fingers... your toes...'),
    ('p5_s11', 'When you are ready... slowly open your eyes...'),
    ('p5_s12', 'Well done. You chose to transmute rather than drain. That is the work. Carry this stillness with you.'),
]

async def gen(key, text):
    path = os.path.join(OUT, f'{key}.mp3')
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(f'  skip {key}.mp3 (exists)')
        return
    tts = edge_tts.Communicate(text, voice=VOICE, rate=RATE, pitch=PITCH)
    await tts.save(path)
    size = os.path.getsize(path)
    print(f'  OK   {key}.mp3  ({size//1024}KB)')

async def main():
    print(f'Generating {len(STEPS)} audio files with {VOICE}...\n')
    for key, text in STEPS:
        await gen(key, text)
    total = sum(os.path.getsize(os.path.join(OUT, f'{k}.mp3')) for k,_ in STEPS) // 1024
    print(f'\nDone. Total audio: {total}KB')

asyncio.run(main())
