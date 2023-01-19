/**
 * @license
 * Copyright (c) 2022 and onwards The McBopomofo Authors.
 * This code is released under the MIT license.
 * SPDX-License-Identifier: MIT
 */

import { LanguageModel, Unigram } from "../Gramambular2";

/**
 * The model for user phrases.
 */
export class UserPhrases implements LanguageModel {
  private map_: Map<string, string[]> = new Map();
  private onPhraseChange: (map: Map<string, string[]>) => void = () => {};

  setUserPhrases(map: Map<string, string[]>): void {
    if (map === null || map === undefined) {
      return;
    }
    this.map_ = map;
  }

  setOnPhraseChange(callback: (map: Map<string, string[]>) => void): void {
    this.onPhraseChange = callback;
  }

  addUserPhrase(key: string, phrase: string): void {
    let list = this.map_.get(key);
    if (list != undefined) {
      if (list.includes(phrase)) {
        return;
      }
      list.push(phrase);
      this.map_.set(key, list);
    } else {
      list = [];
      list.push(phrase);
      this.map_.set(key, list);
    }
    this.onPhraseChange(this.map_);
  }

  getUnigrams(key: string): Unigram[] {
    let result: Unigram[] = [];
    let list = this.map_.get(key);
    if (list != undefined) {
      for (let item of list) {
        let g = new Unigram(item, 0);
        result.push(g);
      }
    }
    return result;
  }

  hasUnigrams(key: string): boolean {
    let list = this.map_.get(key);
    if (list === undefined) return false;
    return list.length > 0;
  }
}

/**
 * The main language model.
 */
export class WebLanguageModel implements LanguageModel {
  private map_: Map<string, [string, number][]>;
  private userPhrases_: UserPhrases = new UserPhrases();

  private converter_?: (input: string) => string | undefined;
  /** Sets the string converter. */
  setConverter(converter?: (input: string) => string | undefined): void {
    this.converter_ = converter;
  }

  private addUserPhraseConverter?: (input: string) => string | undefined;
  /** Sets the string converter. */
  setAddUserPhraseConverter(
    converter?: (input: string) => string | undefined
  ): void {
    this.addUserPhraseConverter = converter;
  }

  setUserPhrases(map: Map<string, string[]>): void {
    this.userPhrases_.setUserPhrases(map);
  }

  setOnPhraseChange(callback: (map: Map<string, string[]>) => void): void {
    this.userPhrases_.setOnPhraseChange(callback);
  }

  /**
   * Adds user phrases.
   * @param key The key.
   * @param phrase The phrase.
   */
  addUserPhrase(key: string, phrase: string): void {
    if (this.addUserPhraseConverter != undefined) {
      phrase = this.addUserPhraseConverter(phrase) ?? phrase;
    }
    this.userPhrases_.addUserPhrase(key, phrase);
  }

  constructor(map: Map<string, [string, number][]>) {
    this.map_ = map;
  }

  getUnigrams(key: string): Unigram[] {
    if (key === " ") {
      let space = new Unigram(" ");
      return [space];
    }

    let result: Unigram[] = [];
    let usedValues: string[] = [];
    let userPhrases = this.userPhrases_.getUnigrams(key);
    for (let phrase of userPhrases) {
      if (this.converter_ != null) {
        let converted = this.converter_(phrase.value) ?? phrase.value;
        phrase = new Unigram(converted, phrase.score);
      }
      if (!usedValues.includes(phrase.value)) {
        result.push(phrase);
      }
      usedValues.push(phrase.value);
    }

    let list = this.map_.get(key);
    if (list != undefined) {
      for (let item of list) {
        let value = item[0];
        let score = item[1];
        if (this.converter_ != null) {
          value = this.converter_(value) ?? value;
        }
        if (!usedValues.includes(value)) {
          let g = new Unigram(value, score);
          result.push(g);
        }
        usedValues.push(value);
      }
    }
    return result;
  }

  hasUnigrams(key: string): boolean {
    if (key === " ") {
      return true;
    }

    let result = this.userPhrases_.hasUnigrams(key);
    if (result) {
      return true;
    }
    let list = this.map_.get(key);
    if (list === undefined) return false;
    return list.length > 0;
  }
}
