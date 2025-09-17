- Keep the UI minimal and make it look like youtube. Get rid of the jarring colors and what not.
- Currently, the practice UI is randomly floating in the air. Noone asked you to implement that. It should simply, unironically, REPLACE THE VIDEO. nothing more, nothing else
- STOP HALLUCINATING RANDOM FEAtURES. do not add gradients, cute extra messages, explanations, screens you think someone wants, etc. Simply follow the actual fcking instructions!!


Implement a proper flow between the following modes. Use a state machine:

## Video Watching Mode

The standard youtube video mode. 
Get rid of the stupid flash icon button, make a simple button "Start Practice".
When the "Start Practice" button is clicked:
- Match the time that we're currently at to the timed caption snippet (so that the user practices the snippet that we're actually at)
- Disable the "Start Practice" button and replace its text with "Loading..." while the vocab is fetched via the OpenAI API (get rid of pre-fetch logic from before)
- Persist the exact second of where we are in the video
- Then, switch to next mode:

## Flashcard Practice Mode

Here, we do the flashcard practice.
Video is replaced with the flashcard UI.
Again, keep it simple and consistent with youtube styles.

First, show the foreign language vocab and a "Reveal" button. No clicking-the-card-to-reveal bullshit, a REVEAL BUTTON.

Once revealed, show both the foreign lang vocab and the translation on the card, with an <hr> in the middle.
Show also the scoring buttons; again keep them consistent with youtube styles instead of burning my eyes out.

Where the "Start Practice" button was instead show an "End Practice" button which if clicked takes us back to watch mode at the second where we were

If no more flashcards left to practice, jump to next mode

## Autoplay Mode

Shows the standard video, autoplaying it from where we were to the end of the snippet.
Still show an "End Practice" button that pauses the video and throws us out the flow to normal Video Watching Mode.

if the video runs until the end of the snippet, jump to next mode

## Evalation Mode

Button next to title still shows "End Practice".
Video is replaced.
Simple UI asking "What did you understand?" with a textbox to answer.
Below that a button "Save and Next" which persists the answer TO LOCALSTORE with video id, snippet index and timestamp.
Then, load the flashcard practice mode for the next snippet.