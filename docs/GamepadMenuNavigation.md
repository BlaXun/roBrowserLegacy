# Gamepad menu navigation

The gamepad moves a focus ring between the buttons, items and rows of the open windows. The code is in `src/UI/Components/JoystickUI/`, and `JoystickUIFocus.js` is where to start reading.

## Using it

| Button | In menus |
|---|---|
| View (tap) | Menu navigation on / off |
| View (hold, alone) | Info of what the cursor or ring is on |
| D-pad | Move to the nearest element that way; at a window's edge, into the next window. Held: repeats |
| A | Press: a button, a row, an item (use / equip, or move it to an open storage, trade or sell list), a skill (use) |
| B | Back: the window's cancel or close button, else leave menus |
| Y | Item or skill info |
| LT / RT (tap) | Previous / next window |
| Right stick | The cursor; the ring follows it. On nothing the ring can take, A clicks at the cursor |
| Left stick, Menu, L3, R3, shortcut combos | As outside menus |

Menu navigation also turns on by itself:
- when a window opens that waits for an answer, and the gamepad was used last: NPC dialogue and menus, amount prompts, message and prompt boxes, Escape, right-click menus, item selections;
- when the server opens storage, a shop, a trade or mail;
- when the gamepad opens a window (View + A / B / X / Y).

It turns off when the window it turned on for is gone, when a skill waits for a target on the map, and when the real mouse moves. It can be switched off in Settings > Gamepad > Menu Navigation (`ControlsSettings.joyUIFocus`).

## Making a window work with it

Most windows need nothing. A window is any GUIComponent shown on the page. The ring goes to what GUIComponent already treats as clickable (`button`, `ui-button`, inputs, links, `.checkbox`), and to anything with a `data-index`, which item, skill and row elements carry. Hidden, disabled, transparent (`opacity: 0`, `pointer-events: none`) and clipped-away elements are skipped. Elements scrolled out of a list stay in, and are scrolled into view when the ring reaches them.

Without a profile, a window gets:
- **A:** a click on the element (mousedown, mouseup, click), sent to the element itself;
- **Y:** a right click;
- **B:** a click on its close or cancel button.

The events bubble out of the shadow root, so delegated listeners hear them. For an item they go to its `.icon` (or its button).

When that is not enough, add a profile to `JoystickWindowProfiles.js`, matched on the component name. Common reasons:
- A should do what a double click does: `primary(el, win)`, with `primaryLabel` for the hint bar.
- The window waits for an answer: `dialog: true`. If the server opens it for the player: `takesFocus: true`.
- B must not press the button the generic rule would find: `back(win)`.
- Some elements should be left out (`exclude`), or only some taken (`only`).

Profiles reach windows through `UIManager.getComponent()` when called, never by import: the windows import the gamepad code. The file's header lists every field.
