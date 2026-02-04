import { Plugin, MarkdownView, Notice } from 'obsidian';
import { keymap, EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';

export default class VimTitleEditPlugin extends Plugin {
	private inTitleMode = false;
	private vimModeClass = ''; // Track current vim mode
	private editedTitle = ''; // Track title as user types
	private titleKeyHandler: ((evt: KeyboardEvent) => void) | null = null;
	private titleInputHandler: (() => void) | null = null;
	private currentTitleEl: HTMLElement | null = null;

	async onload() {
		console.log('Vim Title Edit: Loading plugin');

		// Use DOM event listener to intercept keys BEFORE CodeMirror/Vim
		this.registerDomEvent(document, 'keydown', this.handleEditorKeydown.bind(this), true);

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
		console.log('Vim Title Edit: focusTitle() called');
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			console.log('Vim Title Edit: no MarkdownView found');
			return;
		}

		// Find the inline title element within this view
		const viewEl = view.containerEl;
		const titleEl = viewEl.querySelector('.inline-title') as HTMLDivElement;
		console.log('Vim Title Edit: titleEl found:', !!titleEl);

		if (!titleEl) {
			new Notice('Inline title not found. Enable it in Settings > Editor > Show inline title');
			return;
		}

		// Clean up any existing handlers
		this.cleanupTitleHandlers();

		// Store reference and initial value
		this.currentTitleEl = titleEl;
		this.editedTitle = titleEl.textContent?.trim() || '';
		this.inTitleMode = true;
		console.log('Vim Title Edit: initial title value:', this.editedTitle);

		// Create and attach handlers directly to the title element
		this.titleInputHandler = () => {
			this.editedTitle = titleEl.textContent?.trim() || '';
			console.log('Vim Title Edit: input, new value:', this.editedTitle);
		};

		this.titleKeyHandler = (evt: KeyboardEvent) => {
			console.log('Vim Title Edit: keydown on title, key:', evt.key);
			if (evt.key === 'Escape' || evt.key === 'Enter') {
				console.log('Vim Title Edit: exit key pressed, saving:', this.editedTitle);
				evt.preventDefault();
				evt.stopPropagation();
				this.saveTitleValue(this.editedTitle);
				this.cleanupTitleHandlers();
				this.returnToEditor();
			}
		};

		// Attach handlers directly to the element (capture phase for keydown)
		titleEl.addEventListener('input', this.titleInputHandler);
		titleEl.addEventListener('keydown', this.titleKeyHandler, true);
		console.log('Vim Title Edit: handlers attached to title element');

		// Focus and position cursor at end
		titleEl.focus();
		const range = document.createRange();
		range.selectNodeContents(titleEl);
		range.collapse(false);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
		console.log('Vim Title Edit: title focused, activeElement:', document.activeElement?.className);
	}

	private cleanupTitleHandlers() {
		if (this.currentTitleEl && this.titleKeyHandler) {
			this.currentTitleEl.removeEventListener('keydown', this.titleKeyHandler, true);
		}
		if (this.currentTitleEl && this.titleInputHandler) {
			this.currentTitleEl.removeEventListener('input', this.titleInputHandler);
		}
		this.titleKeyHandler = null;
		this.titleInputHandler = null;
		this.currentTitleEl = null;
		this.inTitleMode = false;
	}

	private returnToEditor() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		view.editor.focus();
		view.editor.setCursor({ line: 0, ch: 0 });
		this.inTitleMode = false;
	}

	private async saveTitleValue(newTitle: string) {
		console.log('Vim Title Edit: saveTitleValue called with:', newTitle);
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) {
			console.log('Vim Title Edit: no view or file, returning');
			return;
		}

		console.log('Vim Title Edit: newTitle =', newTitle, ', current basename =', view.file.basename);
		if (!newTitle) {
			new Notice('Title cannot be empty');
			return;
		}

		// Don't rename if title hasn't changed
		if (newTitle === view.file.basename) {
			console.log('Vim Title Edit: title unchanged, skipping rename');
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
