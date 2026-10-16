# Gamepad menu navigation

The gamepad moves a focus ring between the buttons, items and rows of the open windows. The code is in `src/UI/Components/JoystickUI/`, and `JoystickUIFocus.js` is where to start reading.

## Using it

| Button | In menus |
|---|---|
| View (tap) | Menu navigation on / off |
| View (hold, alone) | Info of what the cursor or ring is on |
| D-pad | Move to the nearest element that way; at a window's edge, into the next window. Held: repeats. On a slider or a drop-down list, left / right change its value |
| A | Press: a button, a row, an item (use / equip, or move it to an open storage, trade or sell list), a skill (use), a shop item (into the deal and back). On a text field: the on-screen keyboard |
| B | Back: first the item or skill info windows Y opened (all at once), then the window's cancel or close button, else leave menus. A dialogue gets B for its answer even with info open |
| X (tap) | What else can be done with the item, skill or slot, as a menu (below) |
| X (hold) | Pick it up (below) |
| Y | Item or skill info |
| LB / RB (tap) | Previous / next tab of the window |
| LT / RT (tap) | Previous / next window |
| Right stick | The cursor; the ring follows it. On nothing the ring can take, A clicks at the cursor |
| Left stick, Menu, L3, R3, shortcut combos | As outside menus |

### X: more actions

X lists what the window offers for the focused element, then **Move…** (for anything that can be dragged) and **Info**:

- inventory item: Use / Equip; Store all / Store some… (storage open); All to cart / Some to cart… (cart open); Offer all / Offer some… (trade open); Sell (NPC sell list open); Gamepad slot…; Drop…
- stored item: Take all / Take some…; All to cart / Some to cart… (cart open)
- cart item: Take all / Take some…; Store all / Store some… (storage open)
- skill: Use; Level up; Gamepad slot…
- shortcut slot: Use; Clear
- worn item: Unequip

"Some…" and "Drop…" put the stack on the window (or the ground), which asks how many, as a mouse drag there does. "Gamepad slot…" opens the slot picker of a held right click.

### Carrying

X held (or Move…) picks the element up, as starting a drag does. The ring turns blue and a small copy of the icon goes with it. Move with the D-pad, LT / RT or the right stick, then:

- A (or X again) puts it down on the focused element, as dropping it there with the mouse does: another window (storage, cart, trade, equipment: equips it, the inventory: takes it), a shortcut slot, an inventory tab (the favourite tab), a mail or refine slot, an NPC shop list. The gamepad HUD can be reached while something is carried, and takes skills and items on its slots.
- With the ring off every element (the right stick moved the cursor away), A puts it where the cursor is: on the map, that drops an item on the ground.
- B puts it back. Leaving menus does too.

### Typing: the on-screen keyboard

A on a text field (a search box, a price, a mail, a name, an NPC asking for text) opens a keyboard on screen, and Menu (Enter) opens it on the chat. It has every button and the sticks while it is open; the character stands. The text goes into the field as it is typed.

| Button | On the keyboard |
|---|---|
| D-pad, left stick | Grid: move between the keys (held: repeats) |
| A | Grid: type the key |
| Left stick + A / B / X / Y | Wheel: the stick picks one of eight groups of four letters, the button the letter at its place |
| X | Delete the letter before the caret (held: repeats) |
| Y | Space |
| LB / RB | Caret left / right |
| LT | Shift: the next letter, again: all letters, again: off |
| RT | Next page: letters, signs, accented letters |
| View | Saved phrases |
| RS click | Grid / wheel (the last one used is kept) |
| Menu | Done: the text is entered as Enter enters it (the chat sends it, an NPC takes the answer) |
| B | Close: the text stays in the field |

On the wheel, X, Y and B are delete, space and close with the stick at rest. The grid's letter rows are QWERTZ for German, QWERTY otherwise. In the chat, an item link already there stays, and the new text goes after it.

Saved phrases (View, or the ★ key): A puts one in at the caret (on the grid the focus then moves to Done, so a second A enters it), ✕ deletes one, "Save text" keeps what has been typed. They start with a few greetings and commands (`@autoloot`, `@go `) and are kept in the browser (`JoystickKeyboard` in local storage).

### Turning on and off

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
- **B:** a click on its close or cancel button;
- **X:** Move… for what is draggable (`draggable="true"` on it or in it), and Info for items;
- **D-pad left / right on a slider or a `select`:** its value. A slider moves by a twentieth of its range; the window hears `input` at every step and `change` once the steps stop, as with a mouse drag;
- **LB / RB:** its tabs, when they look like tabs: controls in a `.tabs`, `.tab-manager`, `.action_tabs` or `#panel-menu` strip, or `.tab`, `.tab-button`, `.tab-label` controls. The open one is the one marked `selected`, `active`, `selectedtab` or `aria-selected`, or a label whose radio button is checked.

Carrying uses the window's own drag and drop: it sends `dragstart` to the element (the window fills `dataTransfer` and `window._OBJ_DRAG_` as for the mouse), and `dragover` and `drop` to where it is put down. A window that takes drops needs nothing more, unless it takes them only on an element the ring cannot reach (an empty slot area): name that in `dropZones`.

The events bubble out of the shadow root, so delegated listeners hear them. For an item they go to its `.icon` (or its button).

When that is not enough, add a profile to `JoystickWindowProfiles.js`, matched on the component name. Common reasons:
- A should do what a double click does: `primary(el, win)`, with `primaryLabel` for the hint bar.
- X should offer more: `actions(el, win, ctx)` returns `[{ label, run(el) }]`; `ctx.pickSlot(el)` opens the gamepad slot picker.
- Only some elements can be picked up: `canMove(el, win)`.
- The window waits for an answer: `dialog: true`. If the server opens it for the player: `takesFocus: true`.
- B must not press the button the generic rule would find: `back(win)`.
- Some elements should be left out (`exclude`), or only some taken (`only`).
- Its tabs do not look like tabs (`tabs: selector`), or nothing on them says which is open (`activeTab(tabs, win)`).
- It shows what an item or skill is, and B should close it before anything else: `info: true`.

Profiles reach windows through `UIManager.getComponent()` when called, never by import: the windows import the gamepad code. The file's header lists every field.
