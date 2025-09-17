change the flashcard logic. ACtuALLY persist flashcards (front+back+learn data) IN LOCALSTORAGE and use this to check if a given word is due. If
  a given word is new (=unseen), immediately show the front+back view, skipping the reveal flow. also do not show the score buttons, simply show "I
  will remember" and create a new ts-fsrs card WITH THE CORRECT FUNCTION FOR THAT (no, not reverse engineering a type Card). Dynamically check for
  due cards, so a new card will come up twice (once its persisted, it will immediately be due). When the user clicks "Wrong", overwrite the save
  function to do the normal fsrs stuff but in the end also set the card due immediately again. track th last picked vocab to prevent something from
  coming up twice in a row. only go to watch if nothing is left to pick. make sure to implement AAAAALLL these instructions AS FUCKING
  STATED!!!!!!!!!


why are you tracking isNew? its covered by BOOOTH whether fsrsCard prop exists, AND by whether fucking lastPicked is undefined. Let's make a plan
  first, yes? The plan is to CLEANLY, EXTENSIBLY, PATTERN-BASED implement it like a senior developer, not to barf a pile of garbage on my
  codebase.

at the fuck is your interpretatino of the reveal flow?!?!?!??! of COURSE THE FUCKING REVEAL FLOW SHOULD STAY FOR DUE CARD.
  JUUUUUUUUUUUUUUUUUUUUST for new cards we show both front+back. Can you read the actual fucking specs I write you please?!?!? Who the fuck told
  you to prioritize due cards!?!?!??!?!?!?!??! Do NOOOOOOOOOOOOOOOOT use fsrs card state new, THATS ENTIRELY FUCKING UNRELATED. you can SIMPLY
  FUCKING CHECK WHETHER A CARD IS NEW BY SEEING WHETHER ITS IN FUCKING LOCALSTORAGE OR FUCKING NOT, which also will tell you whether it has
  associated fsrs data or not. how did you plan getting fsrs card data for a non-existing object?!?!? Revise your fucking plan following MY ACTUAL
  FUCKING MESSAGE AS FUCKING WRITTEN!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! not random hallucinations

The normal reveal flow should have all the same fuckign buttons as before, not randomly jsut a "Wrong" button as you hallucinated in a previous message. It's just IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIF the wrong buton (which is just one of four buttons) ISSSSSSSSSSSSSSSS CLICKED, its gets special treatment as before???


A CARD IS NOT FUCKING DUE JUST BECAUSE ITS IN FUCKING LOCALSTORAGE. It's due when fucking ts-fsrs says its due. Why the fuck do you think we're using it ?!?!?!?!?!?!?! UNDERSTAAAAAAAAAAAAAAAAAAAAND ITS ACTUAL FUCKING USAGE AND HOW TO GET WHETHER SOMETHING IS DUE: https://raw.githubusercontent.com/open-spaced-repetition/ts-fsrs/refs/heads/main/README.md (FEEEEEEEEEEEEEEEEEEEETCH THIS!!!!!)