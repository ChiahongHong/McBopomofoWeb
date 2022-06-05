import { last } from "lodash";
import { InputController } from "./McBopomofo/InputController";
import { Key, KeyName } from "./McBopomofo/Key";

var mcEngineID: string | undefined = undefined;
var mcContext: chrome.input.ime.InputContext | undefined = undefined;
var defaultSettings = {
  layout: "standard",
  select_phrase: "before_cursor",
  candidate_keys: "123456789",
  esc_key_clear_entire_buffer: false,
  chineseConversion: false,
  move_cursor: true,
  letter_mode: "upper",
};
var settings = defaultSettings;
var lang = "en";
chrome.i18n.getAcceptLanguages((langs) => {
  if (langs.length) {
    lang = langs[0];
  }
});

function myLocalizedString(en: string, zh: string): string {
  return lang == "zh-TW" ? zh : en;
}

function makeUI() {
  return {
    reset: () => {
      if (mcContext === undefined) return;
      if (mcEngineID === undefined) return;
      try {
        // The context might be destroyed by the time we reset it, so we use a
        // try/catch block here.
        chrome.input.ime.clearComposition({ contextID: mcContext.contextID });
        chrome.input.ime.setCandidateWindowProperties({
          engineID: mcEngineID,
          properties: {
            auxiliaryText: "",
            auxiliaryTextVisible: false,
            visible: false,
          },
        });
      } catch (e) {}
    },

    commitString: (text: string) => {
      if (mcContext === undefined) return;
      chrome.input.ime.commitText({
        contextID: mcContext.contextID,
        text: text,
      });
    },

    update: (stateString: string) => {
      if (mcContext === undefined) return;
      if (mcEngineID === undefined) return;

      let state = JSON.parse(stateString);
      let buffer = state.composingBuffer;
      let candidates = state.candidates;

      let segments = [];
      let text = "";
      let selectionStart: number | undefined = undefined;
      let selectionEnd: number | undefined = undefined;
      let index = 0;
      for (let item of buffer) {
        text += item.text;
        if (item.style === "highlighted") {
          selectionStart = index;
          selectionEnd = index + item.text.length;
          var segment = {
            start: index,
            end: index + item.text.length,
            style: "doubleUnderline",
          };
          segments.push(segment);
        } else {
          var segment = {
            start: index,
            end: index + item.text.length,
            style: "underline",
          };
          segments.push(segment);
        }
        index += item.text.length;
      }

      chrome.input.ime.setComposition({
        contextID: mcContext.contextID,
        cursor: state.cursorIndex,
        segments: segments,
        text: text,
        selectionStart: selectionStart,
        selectionEnd: selectionEnd,
      });

      if (candidates.length) {
        let chromeCandidates = [];
        let index = 0;
        let selectedIndex = 0;
        for (let candidate of state.candidates) {
          if (candidate.selected) {
            selectedIndex = index;
          }
          var item = {
            candidate: candidate.candidate,
            annotation: "",
            id: index++,
            label: candidate.keyCap,
          };
          chromeCandidates.push(item);
        }

        chrome.input.ime.setCandidateWindowProperties({
          engineID: mcEngineID,
          properties: {
            auxiliaryText: "",
            auxiliaryTextVisible: false,
            visible: true,
            cursorVisible: true,
            vertical: true,
            pageSize: candidates.length,
          },
        });

        chrome.input.ime.setCandidates({
          contextID: mcContext.contextID,
          candidates: chromeCandidates,
        });

        chrome.input.ime.setCursorPosition({
          contextID: mcContext.contextID,
          candidateID: selectedIndex,
        });
      } else if (state.tooltip.length) {
        // Use the candidate window to tooltips.
        chrome.input.ime.setCandidateWindowProperties({
          engineID: mcEngineID,
          properties: {
            auxiliaryText: state.tooltip,
            auxiliaryTextVisible: true,
            visible: true,
            cursorVisible: false,
            windowPosition: "composition",
            pageSize: 1, // pageSize has to be at least 1 otherwise ChromeOS crashes.
          },
        });

        chrome.input.ime.setCandidates({
          contextID: mcContext.contextID,
          candidates: [
            {
              candidate: myLocalizedString("Tooltip", "提示"),
              // chrome.i18n.getMessage("tooltip"),
              annotation: "",
              id: 0,
              label: " ",
            },
          ],
        });
      } else {
        chrome.input.ime.setCandidateWindowProperties({
          engineID: mcEngineID,
          properties: {
            auxiliaryText: "",
            auxiliaryTextVisible: false,
            visible: false,
          },
        });
      }
    },
  };
}

function loadUserPhrases() {
  chrome.storage.sync.get("user_phrase", (value) => {
    let jsonString = value.user_phrase;

    if (jsonString !== undefined) {
      try {
        let obj = JSON.parse(jsonString);
        if (obj) {
          let userPhrases = new Map<string, string[]>(Object.entries(obj));
          mcInputController.setUserPhrases(userPhrases);
        }
      } catch (e) {
        console.log("failed to parse user_phrase:" + e);
      }
    }
  });
}

function loadSettings() {
  chrome.storage.sync.get("settings", (value) => {
    settings = value.settings;
    if (settings === undefined) {
      settings = defaultSettings;
    }
    mcInputController.setChineseConversionEnabled(
      settings.chineseConversion === true
    );
    mcInputController.setKeyboardLayout(settings.layout);
    mcInputController.setSelectPhrase(settings.select_phrase);
    let keys = settings.candidate_keys;
    if (keys == undefined) {
      keys = "123456789";
    }
    mcInputController.setCandidateKeys(settings.candidate_keys);
    mcInputController.setEscClearEntireBuffer(
      settings.esc_key_clear_entire_buffer
    );
    mcInputController.setMoveCursorAfterSelection(settings.move_cursor);
    mcInputController.setLetterMode(settings.letter_mode);
  });
}

function updateMenu() {
  if (mcEngineID === undefined) return;
  var menus = [
    {
      id: "mcbopomofo-chinese-conversion",
      label: myLocalizedString("Input Simplified Chinese", "輸入簡體中文"),
      // chrome.i18n.getMessage("menuChineseConversion"),
      style: "check",
      checked: settings.chineseConversion === true,
    },
    {
      id: "mcbopomofo-options",
      label: myLocalizedString("Options", "選項"),
      // chrome.i18n.getMessage("menuOptions"),
      style: "check",
    },
    {
      id: "mcbopomofo-user-phrase",
      label: myLocalizedString("User Phrases", "使用者詞彙"),
      // chrome.i18n.getMessage("menuUserPhrases"),
      style: "check",
    },
    {
      id: "mcbopomofo-homepage",
      label: myLocalizedString("Homepage", "專案首頁"),
      //  chrome.i18n.getMessage("homepage"),
      style: "check",
    },
  ];
  chrome.input.ime.setMenuItems({ engineID: mcEngineID, items: menus });
}

function toggleChineseConversion() {
  var checked = settings.chineseConversion;
  checked = !checked;
  settings.chineseConversion = checked;

  chrome.notifications.create("mcbopomofo-chinese-conversion" + Date.now(), {
    title: checked
      ? myLocalizedString("Chinese Conversion On", "簡繁轉換已開啟")
      : myLocalizedString("Chinese Conversion Off", "簡繁轉換已關閉"),

    //  chrome.i18n.getMessage(
    //   checked ? "chineseConversionOn" : "chineseConversionOff"
    // ),
    message: "",
    //  chrome.i18n.getMessage("messageFromMcBopomofo"),
    type: "basic",
    iconUrl: "icons/icon48.png",
  });

  chrome.storage.sync.set({ settings: settings }, () => {
    if (mcEngineID === undefined) return;
    if (mcContext === undefined) return;

    loadSettings();
    updateMenu();
  });
}

// Create a new input controller.
const mcInputController = new InputController(makeUI());

// The horizontal candidate windows on ChromeOS is actually broken so we
// use the vertical one only.
mcInputController.setUserVerticalCandidates(true);

// Changes language needs to restarts ChromeOS login session so it won't
// change until user logs in again. So, we can just set language code once
// at the start.

// chrome.i18n.getUILanguage() doe not work in service worker. See https://groups.google.com/a/chromium.org/g/chromium-extensions/c/dG6JeZGkN5w
// let languageCode = chrome.i18n.getUILanguage();
chrome.i18n.getAcceptLanguages((langs) => {
  if (!langs.length) {
    mcInputController.setLanguageCode("en");
    return;
  }
  mcInputController.setLanguageCode(langs[0]);
});

chrome.input.ime.onActivate.addListener((engineID) => {
  mcEngineID = engineID;
  loadSettings();
  updateMenu();
  loadUserPhrases();

  mcInputController.setOnPhraseChange((userPhrases) => {
    const obj = Object.fromEntries(userPhrases);
    let jsonString = JSON.stringify(obj);
    chrome.storage.sync.set({ user_phrase: jsonString });
  });
});

chrome.input.ime.onBlur.addListener((context) => {
  mcInputController.reset();
});

chrome.input.ime.onReset.addListener((context) => {
  mcInputController.reset();
});

chrome.input.ime.onFocus.addListener((context) => {
  mcContext = context;
  loadSettings();
});

chrome.input.ime.onKeyEvent.addListener((engineID, keyData) => {
  if (keyData.type != "keydown") {
    return false;
  }

  if (
    keyData.altKey ||
    keyData.ctrlKey ||
    keyData.altgrKey ||
    keyData.capsLock
  ) {
    return false;
  }
  let keyEvent = KeyFromKeyboardEvent(keyData);
  return mcInputController.mcbopomofoKeyEvent(keyEvent);
});

chrome.input.ime.onMenuItemActivated.addListener((engineID, name) => {
  if (name === "mcbopomofo-chinese-conversion") {
    toggleChineseConversion();
    return;
  }

  function tryOpen(url: string) {
    chrome.tabs.query({ url: url }).then((tabs) => {
      if (tabs.length == 0) {
        chrome.tabs.create({ active: true, url: url });
        return;
      }
      let tabId = tabs[0].id;
      if (tabId === undefined) {
        chrome.tabs.create({ active: true, url: url });
      } else {
        chrome.tabs.update(tabId, { selected: true });
      }
    });
  }

  if (name === "mcbopomofo-options") {
    let page = "options.html";
    tryOpen(chrome.runtime.getURL(page));
    return;
  }

  if (name === "mcbopomofo-user-phrase") {
    let page = "user_phrase.html";
    tryOpen(chrome.runtime.getURL(page));
    return;
  }

  if (name === "mcbopomofo-homepage") {
    tryOpen("https://mcbopomofo.openvanilla.org/");
    return;
  }
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // Reloads the user phrases by the message sent from "user_phrase.html".
  if (request.command === "reload_user_phrase") {
    loadUserPhrases();
    sendResponse({ status: "ok" });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-chinese-convert") {
    toggleChineseConversion();
  }
});

function KeyFromKeyboardEvent(event: chrome.input.ime.KeyboardEvent) {
  let keyName = KeyName.UNKNOWN;
  switch (event.code) {
    case "ArrowLeft":
      keyName = KeyName.LEFT;
      break;
    case "ArrowRight":
      keyName = KeyName.RIGHT;
      break;
    case "ArrowUp":
      keyName = KeyName.UP;
      break;
    case "ArrowDown":
      keyName = KeyName.DOWN;
      break;
    case "Home":
      keyName = KeyName.HOME;
      break;
    case "End":
      keyName = KeyName.END;
      break;
    case "Backspace":
      keyName = KeyName.BACKSPACE;
      break;
    case "Delete":
      keyName = KeyName.DELETE;
      break;
    case "Enter":
      keyName = KeyName.RETURN;
      break;
    case "Escape":
      keyName = KeyName.ESC;
      break;
    case "Space":
      keyName = KeyName.SPACE;
      break;
    case "Tab":
      keyName = KeyName.TAB;
      break;
    case "PageUp":
      keyName = KeyName.PAGE_UP;
      break;
    case "PageDown":
      keyName = KeyName.PAGE_DOWN;
      break;
    default:
      keyName = KeyName.ASCII;
      break;
  }
  let key = new Key(event.key, keyName, event.shiftKey, event.ctrlKey);
  return key;
}