/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import ReadSubPage from '../readsubpage.js';
import ReadPage from '../readpage.js';
import speech from '../../../text/speech.js';
import i18n from '../../../i18n/i18n.js';
import config from '../../../data/config.js';
import template from '../../../ui/util/template.js';
import Menu from '../../../ui/component/menu.js';

export default class ControlPage extends ReadSubPage {
  /**
   * @param {HTMLElement} container
   * @param {ReadPage} readPage
   */
  constructor(container, readPage) {
    super(container, readPage);
  }
  onFirstActivate() {
    super.onFirstActivate();

    const headerRef = template.create('header');
    this.container.insertBefore(headerRef.get('root'), this.container.firstChild);
    const backButton = template.iconButton('back', i18n.getMessage('buttonBack'));
    headerRef.get('left').appendChild(backButton);
    const renameTitle = i18n.getMessage('buttonRename');
    const headerRename = document.createElement('button');
    headerRename.type = 'button';
    headerRename.className = 'read-header-rename';
    headerRename.setAttribute('aria-label', renameTitle);
    const headerRenameWrap = headerRename.appendChild(document.createElement('div'));
    headerRenameWrap.className = 'button-wrap';
    headerRenameWrap.tabIndex = -1;
    headerRenameWrap.textContent = renameTitle;
    headerRef.get('right').appendChild(headerRename);
    this.bookTitleElement = headerRef.get('mid');
    this.backButton = backButton;
    this.headerRenameButton = headerRename;
    this.hide();

    this.coverElement = this.container.querySelector('.read-control-cover');
    this.coverElement.setAttribute('aria-label', i18n.getMessage('readControlClose'));

    const iconLine = this.container.querySelector('.icon-line');
    const genButton = (type, title) => {
      const item = iconLine.appendChild(document.createElement('div'));
      item.classList.add('icon-line-item');
      const button = item.appendChild(template.iconButton(type, title));
      return button;
    };
    const genTextButton = title => {
      const item = iconLine.appendChild(document.createElement('div'));
      item.classList.add('icon-line-item');
      const button = item.appendChild(document.createElement('button'));
      button.type = 'button';
      button.classList.add('icon-line-text-button');
      button.setAttribute('aria-label', title);
      const wrap = button.appendChild(document.createElement('div'));
      wrap.className = 'button-wrap';
      wrap.tabIndex = -1;
      wrap.textContent = title;
      return button;
    };
    this.renameButton = genTextButton(i18n.getMessage('buttonRename'));
    this.renameButton.parentElement.classList.add('read-bar-rename');
    this.themeButton = genTextButton(i18n.getMessage('buttonTheme'));
    this.toolButton = genButton('more', i18n.getMessage('readMenuButton'));

    this.titleDialog = document.querySelector('#title_dialog');
    this.titleInput = document.querySelector('#title_input');
    this.titleInput.placeholder = i18n.getMessage('readRenamePlaceholder');

    this.moreMenuHandler = new Map();

    this.headerRenameButton.addEventListener('click', () => {
      this.openRename();
    });
    this.renameButton.addEventListener('click', () => {
      this.openRename();
    });
    this.titleDialog.addEventListener('submit', event => {
      event.preventDefault();
      const title = this.titleInput.value.trim();
      if (!title) return;
      this.readPage.rename(title);
      this.closeRename();
    });
    this.titleDialog.querySelector('#title_cancel').addEventListener('click', () => {
      this.closeRename();
    });
    this.titleDialog.querySelector('.url-dialog-cover').addEventListener('click', () => {
      this.closeRename();
    });
    this.titleDialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeRename();
    });

    this.replaceDialog = document.querySelector('#replace_dialog');
    this.replaceFind = document.querySelector('#replace_find');
    this.replaceWith = document.querySelector('#replace_with');
    this.replaceFind.placeholder = i18n.getMessage('readReplaceFind');
    this.replaceWith.placeholder = i18n.getMessage('readReplaceWith');
    this.replaceDialog.addEventListener('submit', event => {
      event.preventDefault();
      const find = this.replaceFind.value;
      const replacement = this.replaceWith.value;
      if (!find) {
        alert(i18n.getMessage('readReplaceEmpty'));
        return;
      }
      this.closeReplace();
      this.readPage.replaceText(find, replacement);
    });
    this.replaceDialog.querySelector('#replace_cancel').addEventListener('click', () => {
      this.closeReplace();
    });
    this.replaceDialog.querySelector('.url-dialog-cover').addEventListener('click', () => {
      this.closeReplace();
    });
    this.replaceDialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeReplace();
    });

    this.toolItems = [
      { title: i18n.getMessage('buttonContents'), value: 'contents' },
      { title: i18n.getMessage('buttonBookmark'), value: 'bookmark' },
      { title: i18n.getMessage('buttonSearch'), value: 'search' },
      { title: i18n.getMessage('buttonJump'), value: 'jump' },
      { title: i18n.getMessage('buttonStripBlank'), value: 'blank' },
      { title: i18n.getMessage('buttonReplace'), value: 'replace' },
    ];
    this.speechToolItem = { title: i18n.getMessage('buttonSpeech'), value: 'speech' };
    this.syncSpeechTool(speech.getPreferVoice() != null);
    this.toolMenu = new Menu({
      groups: [this.toolItems, [{
        title: i18n.getMessage('readMenuCancel'),
      }]],
    });
    this.themeMenu = new Menu({
      groups: [[
        { title: i18n.getMessage('configThemeAuto'), value: 'auto' },
        { title: i18n.getMessage('configThemeLight'), value: 'light' },
        { title: i18n.getMessage('configThemeSepia'), value: 'sepia' },
        { title: i18n.getMessage('configThemeGreen'), value: 'green' },
        { title: i18n.getMessage('configThemeGray'), value: 'gray' },
        { title: i18n.getMessage('configThemeDark'), value: 'dark' },
        { title: i18n.getMessage('configThemeNight'), value: 'night' },
        { title: i18n.getMessage('configThemeOcean'), value: 'ocean' },
        { title: i18n.getMessage('configThemeInk'), value: 'ink' },
      ], [{
        title: i18n.getMessage('readMenuCancel'),
      }]],
    });
    this.backButton.addEventListener('click', event => {
      this.readPage.gotoList();
    });
    this.toolButton.addEventListener('click', () => {
      this.speechToolItem.title = this.readPage.isSpeaking()
        ? i18n.getMessage('buttonSpeechStop')
        : i18n.getMessage('buttonSpeech');
    });
    this.toolMenu.bind(this.toolButton, action => {
      if (action === 'search' || action === 'contents' || action === 'bookmark') {
        this.hide();
        this.readPage.toggleIndexPage(action);
      } else if (action === 'jump') {
        this.hide();
        this.readPage.showJumpPage();
      } else if (action === 'speech') {
        this.hide();
        this.readPage.toggleSpeech();
      } else if (action === 'blank') {
        this.readPage.stripBlankLines();
      } else if (action === 'replace') {
        this.openReplace();
      } else if (this.moreMenuHandler.has(action)) {
        this.moreMenuHandler.get(action)();
      }
    });
    this.themeMenu.bind(this.themeButton, value => {
      if (!value) return;
      config.set('theme', value);
    });
    this.coverElement.addEventListener('touchstart', event => {
      event.preventDefault();
      window.requestAnimationFrame(() => { this.hide(); });
    }, { passive: false });
    this.coverElement.addEventListener('mousedown', event => {
      if (event.button === 0) {
        window.requestAnimationFrame(() => { this.hide(); });
      }
    });

    speech.onPreferVoiceChange(voice => {
      this.syncSpeechTool(voice != null);
    });

    this.container.addEventListener('focusin', event => {
      this.hasFocus = true;
      this.container.classList.add('read-control-active');
    });
    this.container.addEventListener('focusout', event => {
      this.hasFocus = false;
      if (!this.isShow) this.container.classList.remove('read-control-active');
    });
  }
  onActivate() {
    super.onActivate();

    this.setBookTitle(this.readPage.getMeta().title);
    this.hide();
  }
  setBookTitle(title) {
    this.bookTitleElement.textContent = title;
    this.bookTitleElement.lang = this.readPage.getLang();
  }
  openRename() {
    this.titleDialog.hidden = false;
    this.titleInput.value = this.readPage.getMeta().title;
    this.titleInput.focus();
    this.titleInput.select();
  }
  closeRename() {
    this.titleDialog.hidden = true;
  }
  openReplace() {
    this.replaceDialog.hidden = false;
    this.replaceFind.value = '';
    this.replaceWith.value = '';
    this.replaceFind.focus();
  }
  closeReplace() {
    if (this.replaceDialog) this.replaceDialog.hidden = true;
  }
  syncSpeechTool(enabled) {
    const listed = this.toolItems.includes(this.speechToolItem);
    if (enabled && !listed) {
      const at = this.toolItems.findIndex(item => item.value === 'blank');
      this.toolItems.splice(at === -1 ? this.toolItems.length : at, 0, this.speechToolItem);
    }
    if (!enabled && listed) this.toolItems.splice(this.toolItems.indexOf(this.speechToolItem), 1);
  }
  onInactivate() {
    super.onInactivate();

    this.hide();
  }
  hide() {
    this.isShow = false;
    this.closeReplace();
    this.container.classList.remove('read-control-active');
    if (this.hasFocus) {
      this.hasFocus = false;
      document.documentElement.focus();
    }
    this.readPage.textPage?.show();
  }
  show() {
    this.isShow = true;
    this.container.classList.add('read-control-active', 'read-control-active-init');
    this.readPage.textPage?.hide();
    window.requestAnimationFrame(() => {
      this.container.classList.remove('read-control-active-init');
    });
  }
  disable() {
    this.isEnabled = false;
    this.container.classList.add('read-control-disabled');
  }
  enable() {
    this.isEnabled = true;
    this.container.classList.remove('read-control-disabled');
  }
  focus() {
    this.backButton.focus();
  }
  registerMoreMenu(title, handler) {
    const key = {}, item = { title, value: key };
    this.toolItems.push(item);
    this.moreMenuHandler.set(key, handler);
    return () => {
      const index = this.toolItems.indexOf(item);
      if (index !== -1) this.toolItems.splice(index, 1);
      this.moreMenuHandler.delete(key);
    };
  }
}
