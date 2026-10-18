# Agents panel for Hermes Desktop

An **Agents** box under the sessions sidebar that shows only what the sessions list does not: the helper agents and background jobs running under each chat, and chats waiting on your answer. It says "No agents running" when nothing runs.

Click a chat name to jump to it, ⌘ click to open it as a tab, ⇧ click to pop it into its own window. ⌘K "Jump to the next chat that needs me" works from the keyboard.

## Install

Open on the computer that runs Hermes Desktop:

`hermes://plugin/install?repo=supporteraphina/hermes-agents-panel/agents-panel&force=1`

Then turn it on in Capabilities → Plugins if it is off.

## Build

`npm install && npm run build` writes `agents-panel/plugin.js`.
