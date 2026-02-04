# Vim Title Edit

Navigate to and edit Obsidian file titles using Vim keybindings.

## Features

- Press `k` on line 0 in Vim normal mode to focus the inline title
- Press `Enter` or `Escape` to save and return to editor
- Press `j` to return to editor

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/vim-title-edit.git
cd vim-title-edit
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your Obsidian plugins folder:

```bash
cp main.js manifest.json styles.css ~/.obsidian/plugins/vim-title-edit/
```

Then enable the plugin in Obsidian settings.

## Requirements

- Obsidian with Vim mode enabled
- "Show inline title" enabled in Editor settings
