# Agents panel for Hermes Desktop

An **Agents** list under the sessions sidebar with every live chat on the backend:

- **Needs you** (amber): a question or approval is waiting
- **Working** (accent): the chat is running, with its helper agents and background jobs listed under it
- **Done** (green): finished a turn since you last opened it
- **Idle**: folded away at the bottom

Chats that need you sort first. Click a chat to jump to it, ⌘ click to open it as a tab (then drag it into a split), ⇧ click to pop it into its own window. ⌘K "Jump to the next chat that needs me" does the same from the keyboard.

## Install

Open on the computer that runs Hermes Desktop:

`hermes://plugin/install?repo=supporteraphina/hermes-agents-panel/agents-panel&force=1`

Then turn it on in Capabilities → Plugins if it is off.

## Build

`npm install && npm run build` writes `agents-panel/plugin.js`.
