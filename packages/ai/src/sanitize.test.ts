import { describe, it, expect } from 'vitest';
import { sanitizeText, validateLength } from './sanitize';

describe('sanitizeText', () => {
  it('removes script tags', () => {
    const result = sanitizeText('Hello <script>alert("xss")</script> World');
    expect(result.text).toBe('Hello  World');
    expect(result.warnings).toContain('script_tags_removed');
  });

  it('removes HTML tags', () => {
    const result = sanitizeText('Hello <b>bold</b> <img src=x>');
    expect(result.text).toBe('Hello bold');
    expect(result.warnings).toContain('html_tags_removed');
  });

  it('removes event handlers', () => {
    const result = sanitizeText('Text onclick="alert(1)" more');
    expect(result.text).not.toContain('onclick');
    expect(result.warnings).toContain('event_handlers_removed');
  });

  it('flags suspicious URLs without removing them', () => {
    const result = sanitizeText('Check this: bit.ly/abc123');
    expect(result.text).toContain('bit.ly/abc123');
    expect(result.warnings).toContain('suspicious_urls_detected');
  });

  it('normalizes excessive whitespace', () => {
    const result = sanitizeText('Line1\n\n\n\n\n\nLine2');
    expect(result.text).toBe('Line1\n\n\nLine2');
  });

  it('trims whitespace', () => {
    const result = sanitizeText('  hello  ');
    expect(result.text).toBe('hello');
  });

  it('returns empty warnings for clean text', () => {
    const result = sanitizeText('שלום עולם');
    expect(result.text).toBe('שלום עולם');
    expect(result.warnings).toEqual([]);
  });

  it('handles Hebrew text correctly', () => {
    const result = sanitizeText('זהו טקסט בעברית עם <b>עיצוב</b>');
    expect(result.text).toBe('זהו טקסט בעברית עם עיצוב');
  });

  it('handles empty input', () => {
    const result = sanitizeText('');
    expect(result.text).toBe('');
    expect(result.warnings).toEqual([]);
  });

  it('handles multiple attack vectors simultaneously', () => {
    const result = sanitizeText(
      '<script>evil()</script> <div onclick="hack()">text</div> bit.ly/bad',
    );
    expect(result.text).not.toContain('<script>');
    expect(result.text).not.toContain('onclick');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateLength', () => {
  it('returns null for valid length', () => {
    expect(validateLength('hello', 1, 100)).toBeNull();
  });

  it('returns error for too short text', () => {
    const error = validateLength('hi', 5, 100);
    expect(error).toContain('קצר');
    expect(error).toContain('5');
  });

  it('returns error for too long text', () => {
    const error = validateLength('x'.repeat(101), 1, 100);
    expect(error).toContain('ארוך');
    expect(error).toContain('100');
  });

  it('handles exact boundaries', () => {
    expect(validateLength('abc', 3, 3)).toBeNull();
  });
});
