import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { parseHTML } from 'linkedom';
import { narouAdapter } from '@/content/siteAdapters/narou';
import { kakuyomuAdapter } from '@/content/siteAdapters/kakuyomu';
import { extractFromNextData } from '@/content/siteAdapters/kakuyomu';

function loadDoc(rel: string): Document {
  const path = fileURLToPath(new URL(`./fixtures/${rel}`, import.meta.url));
  const html = readFileSync(path, 'utf-8');
  const { document } = parseHTML(html);
  return document as unknown as Document;
}

function fakeLocation(href: string): Location {
  const u = new URL(href);
  return { href, hostname: u.hostname, pathname: u.pathname } as Location;
}

describe('narouAdapter', () => {
  const loc = fakeLocation('https://ncode.syosetu.com/n1234ab/1/');

  it('matches なろう host', () => {
    expect(narouAdapter.matches(loc)).toBe(true);
    expect(narouAdapter.matches(fakeLocation('https://kakuyomu.jp/works/1/episodes/2'))).toBe(false);
  });

  it('parses chapter ref from URL', () => {
    expect(narouAdapter.getChapterRef(loc)).toEqual({
      site: 'narou',
      workId: 'n1234ab',
      chapterId: '1',
      url: loc.href,
    });
  });

  it('extracts title and paragraphs (ruby stripped, empty removed)', async () => {
    const doc = loadDoc('narou/sample-chapter.html');
    const ch = await narouAdapter.extract(doc, loc);
    expect(ch.title).toBe('第1話　出会い');
    expect(ch.paragraphs).toEqual([
      '朝の光が窓から差し込んでいた。',
      '少女はゆっくりと目を開けた。',
      '「おはよう」と彼は言った。',
    ]);
    expect(ch.charCount).toBeGreaterThan(0);
    expect(ch.ref.workId).toBe('n1234ab');
  });
});

describe('kakuyomuAdapter', () => {
  const loc = fakeLocation('https://kakuyomu.jp/works/16800000/episodes/16800001');

  it('matches カクヨム host and parses ref', () => {
    expect(kakuyomuAdapter.matches(loc)).toBe(true);
    expect(kakuyomuAdapter.getChapterRef(loc)).toEqual({
      site: 'kakuyomu',
      workId: '16800000',
      chapterId: '16800001',
      url: loc.href,
    });
  });

  it('extracts from DOM', async () => {
    const doc = loadDoc('kakuyomu/sample-chapter.html');
    const ch = await kakuyomuAdapter.extract(doc, loc);
    expect(ch.title).toBe('第1話　旅立ち');
    expect(ch.paragraphs).toEqual([
      '風が丘を駆け抜けた。',
      '少年は荷物を背負い、村を後にした。',
      '「いってきます」',
    ]);
  });

  it('falls back to __NEXT_DATA__ when DOM body missing', () => {
    const doc = loadDoc('kakuyomu/sample-chapter.html');
    const next = extractFromNextData(doc);
    expect(next?.title).toBe('第1話　旅立ち');
    expect(next?.paragraphs).toEqual([
      '風が丘を駆け抜けた。',
      '少年は荷物を背負い、村を後にした。',
      '「いってきます」',
    ]);
  });
});
