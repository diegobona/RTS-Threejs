import { afterEach, describe, expect, it } from 'vitest';
import { currentLocale, detectLocaleFromLanguages, setLocaleForTests, uiText } from './i18n';

describe('i18n locale detection', () => {
  afterEach(() => setLocaleForTests(null));

  it('uses Chinese for Chinese browser languages', () => {
    expect(detectLocaleFromLanguages(['zh-CN', 'en-US'])).toBe('zh');
    expect(detectLocaleFromLanguages(['zh-Hant-TW'])).toBe('zh');
  });

  it('uses English for non-Chinese browser languages', () => {
    expect(detectLocaleFromLanguages(['en-US'])).toBe('en');
    expect(detectLocaleFromLanguages(['fr-FR', 'zh-CN'])).toBe('en');
    expect(detectLocaleFromLanguages([])).toBe('en');
  });

  it('exposes one active text set at runtime', () => {
    setLocaleForTests('zh');
    expect(currentLocale()).toBe('zh');
    expect(uiText().setup.startGame).toBe('开始游戏');

    setLocaleForTests('en');
    expect(currentLocale()).toBe('en');
    expect(uiText().setup.startGame).toBe('Start Game');
  });
});
