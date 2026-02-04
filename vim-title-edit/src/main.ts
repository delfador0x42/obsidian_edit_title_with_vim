import { Plugin, MarkdownView, Notice } from 'obsidian';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';

export default class VimTitleEditPlugin extends Plugin {
	private inTitleMode = false;
	private vimModeClass = ''; // Track current vim mode

	async onload() {
		console.log('Vim Title Edit: Loading plugin');

		// Use DOM event listener to intercept keys BEFORE CodeMirror/Vim
		this.registerDomEvent(document, 'keydown', this.handleEditorKeydown.bind(this), true);

		// Register DOM event handler for title keypress
		this.registerDomEvent(document, 'keydown', this.handleTitleKeydown.bind(this));

		// Track vim mode changes via native event listener
		const vimModeHandler = (evt: Event) => {
			const customEvt = evt as CustomEvent;
			this.vimModeClass = customEvt.detail?.mode || '';
			console.log('Vim Title Edit: mode changed to', this.vimModeClass);
		};
		document.addEventListener('vim-mode-change', vimModeHandler);
		this.register(() => document.removeEventListener('vim-mode-change', vimModeHandler));

		// Also register a command for manual access
		this.addCommand({
			id: 'focus-title',
			name: 'Focus inline title',
			callback: () => this.focusTitle()
		});

		console.log('Vim Title Edit: Plugin loaded');
	}

	onunload() {
		console.log('Vim Title Edit: Plugin unloaded');
	}

	private handleEditorKeydown(evt: KeyboardEvent) {
		// Only handle 'k' key
		if (evt.key !== 'k') return;

		// Check if we're in the editor (not title or other input)
		const target = evt.target as HTMLElement;
		const editorEl = target.closest('.cm-editor');
		if (!editorEl) return;

		// Check if in vim normal mode by looking for the fat cursor (block cursor)
		// In normal mode, vim shows a block cursor (.cm-fat-cursor)
		// In insert mode, there's a thin cursor (.cm-cursor)
		const hasFatCursor = editorEl.querySelector('.cm-fat-cursor') !== null;
		const hasVimCursor = editorEl.querySelector('.cm-vimCursorLayer') !== null;

		// Also check tracked mode from event
		const isVimNormal = hasFatCursor || hasVimCursor || this.vimModeClass === 'normal';

		console.log('Vim Title Edit: k pressed, isVimNormal:', isVimNormal,
			'hasFatCursor:', hasFatCursor, 'hasVimCursor:', hasVimCursor,
			'vimModeClass:', this.vimModeClass);

		if (!isVimNormal) return;

		// Get active editor and check cursor position
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const cursor = view.editor.getCursor();
		console.log('Vim Title Edit: cursor at line', cursor.line);

		// Line 0 is the first line (0-indexed)
		if (cursor.line === 0) {
			console.log('Vim Title Edit: intercepting k, focusing title');
			evt.preventDefault();
			evt.stopPropagation();
			this.focusTitle();
		}
	}

	private focusTitle() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		// Find the inline title element within this view
		const viewEl = view.containerEl;
		const titleEl = viewEl.querySelector('.inline-title') as HTMLDivElement;

		if (!titleEl) {
			new Notice('Inline title not found. Enable it in Settings > Editor > Show inline title');
			return;
		}

		titleEl.focus();

		// Put cursor at end of title
		const range = document.createRange();
		range.selectNodeContents(titleEl);
		range.collapse(false); // collapse to end
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);

		this.inTitleMode = true;
	}

	private handleTitleKeydown(evt: KeyboardEvent) {
		const target = evt.target as HTMLElement;

		// Only handle events from inline title
		if (!target.classList.contains('inline-title')) {
			return;
		}

		// Return to editor on j or Escape
		if (evt.key === 'j' || evt.key === 'Escape') {
			evt.preventDefault();
			evt.stopPropagation();
			this.returnToEditor();
			return;
		}

		// Save and return on Enter
		if (evt.key === 'Enter') {
			evt.preventDefault();
			evt.stopPropagation();
			this.saveTitle(target);
			this.returnToEditor();
			return;
		}
	}

	private returnToEditor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		view.editor.focus();
		view.editor.setCursor({ line: 0, ch: 0 });
		this.inTitleMode = false;
	}

	private async saveTitle(titleEl: HTMLElement) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) return;

		const newTitle = titleEl.textContent?.trim();
		if (!newTitle) {
			new Notice('Title cannot be empty');
			return;
		}

		// Don't rename if title hasn't changed
		if (newTitle === view.file.basename) {
			return;
		}

		// Build new file path
		const folder = view.file.parent?.path || '';
		const newPath = folder ? `${folder}/${newTitle}.md` : `${newTitle}.md`;

		try {
			await this.app.fileManager.renameFile(view.file, newPath);
			new Notice(`Renamed to: ${newTitle}`);
		} catch (error) {
			new Notice(`Failed to rename: ${error}`);
		}
	}
}
